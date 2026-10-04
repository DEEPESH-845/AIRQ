#!/usr/bin/env bash
# One-command deploy: stack -> web app -> first world tick.
# Usage: infra/deploy.sh [alert-email]    (SKIP_WEB=1 deploys only the stack; SKIP_TICK=1 skips the first world tick)
set -euo pipefail
cd "$(dirname "$0")/.."
STACK=arq  # deployed before the AIRQ rename; stack and resource names stay arq-* (renaming would replace them)
REGION=${AWS_REGION:-$(aws configure get region || echo us-east-1)}

echo "== staging tick Lambda"
rm -rf build/tick && mkdir -p build/tick/geo
cp pipeline/tick.py build/tick/
cp web/public/geo/districts.geojson web/public/geo/plants.geojson build/tick/geo/

echo "== staging General Lambda (Strands, linux/arm64 wheels)"
rm -rf build/general && mkdir -p build/general
cp infra/general/app.py web/src/lib/advice-matrix.json build/general/
python3 -m pip install -q --target build/general --platform manylinux2014_aarch64 --implementation cp \
  --python-version 3.13 --only-binary=:all: --upgrade strands-agents >/dev/null

echo "== staging player Lambda (Pillow, linux/arm64 wheels)"
rm -rf build/player && mkdir -p build/player
cp infra/player/app.py web/src/lib/economy.json build/player/
python3 -m pip install -q --target build/player --platform manylinux2014_aarch64 --implementation cp \
  --python-version 3.13 --only-binary=:all: --upgrade pillow >/dev/null
[ -f .cert-secret ] || python3 -c "import secrets;print(secrets.token_urlsafe(32))" > .cert-secret
CERT_SECRET=$(cat .cert-secret)

echo "== staging push Lambda"
(cd infra/push && npm i --omit=dev --silent)
VAPID_PUBLIC=$(python3 -c "import json;print(json.load(open('.vapid.json'))['publicKey'])")
VAPID_PRIVATE=$(python3 -c "import json;print(json.load(open('.vapid.json'))['privateKey'])")

echo "== deploying stack $STACK ($REGION)"
sam deploy --template-file infra/template.yaml --stack-name $STACK --region "$REGION" \
  --capabilities CAPABILITY_IAM --resolve-s3 --no-fail-on-empty-changeset --no-confirm-changeset \
  --parameter-overrides "AlertEmail=${1:-}" "VapidPublicKey=$VAPID_PUBLIC" "VapidPrivateKey=$VAPID_PRIVATE" "CertSecret=$CERT_SECRET"

out() { aws cloudformation describe-stacks --stack-name $STACK --region "$REGION" --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }
BUCKET=$(out Bucket); DIST=$(out DistributionId); URL=$(out SiteUrl); SM=$(out WorldTickArn)

[ -n "${SKIP_WEB:-}" ] && { echo "== stack only (SKIP_WEB)"; exit 0; }

echo "== building web app"
(cd web && VITE_VAPID_PUBLIC_KEY="$VAPID_PUBLIC" npx vite build >/dev/null)

echo "== uploading to s3://$BUCKET"
aws s3 sync web/dist "s3://$BUCKET" --delete --exclude "data/*" --exclude "archive/*" --exclude "cache/*" --exclude "briefings/*" \
  --exclude "index.html" --exclude "sw.js" --cache-control "public, max-age=31536000, immutable" >/dev/null
for f in index.html sw.js; do aws s3 cp "web/dist/$f" "s3://$BUCKET/$f" --cache-control "no-cache" >/dev/null; done
aws s3 sync web/dist/geo "s3://$BUCKET/geo" --cache-control "public, max-age=86400" >/dev/null

if [ -z "${SKIP_TICK:-}" ]; then
echo "== running first world tick"
EXEC=$(aws stepfunctions start-execution --state-machine-arn "$SM" --region "$REGION" --query executionArn --output text)
for _ in $(seq 60); do
  S=$(aws stepfunctions describe-execution --execution-arn "$EXEC" --region "$REGION" --query status --output text)
  [ "$S" != RUNNING ] && break; sleep 10
done
echo "tick: $S"
fi

aws cloudfront create-invalidation --distribution-id "$DIST" --paths "/index.html" "/sw.js" "/data/*" >/dev/null
echo "== live at $URL"
