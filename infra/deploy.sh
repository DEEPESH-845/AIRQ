#!/usr/bin/env bash
# One-command deploy: stack -> web app -> first world tick.
# Usage: infra/deploy.sh [alert-email]
set -euo pipefail
cd "$(dirname "$0")/.."
STACK=arq
REGION=${AWS_REGION:-$(aws configure get region || echo us-east-1)}

echo "== staging tick Lambda"
rm -rf build/tick && mkdir -p build/tick/geo
cp pipeline/tick.py build/tick/
cp web/public/geo/districts.geojson web/public/geo/plants.geojson build/tick/geo/

echo "== deploying stack $STACK ($REGION)"
sam deploy --template-file infra/template.yaml --stack-name $STACK --region "$REGION" \
  --capabilities CAPABILITY_IAM --resolve-s3 --no-fail-on-empty-changeset --no-confirm-changeset \
  --parameter-overrides "AlertEmail=${1:-}"

out() { aws cloudformation describe-stacks --stack-name $STACK --region "$REGION" --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }
BUCKET=$(out Bucket); DIST=$(out DistributionId); URL=$(out SiteUrl); SM=$(out WorldTickArn)

echo "== building web app"
(cd web && npx vite build >/dev/null)

echo "== uploading to s3://$BUCKET"
aws s3 sync web/dist "s3://$BUCKET" --delete --exclude "data/*" --exclude "archive/*" --exclude "cache/*" \
  --exclude "index.html" --cache-control "public, max-age=31536000, immutable" >/dev/null
aws s3 cp web/dist/index.html "s3://$BUCKET/index.html" --cache-control "no-cache" >/dev/null
aws s3 sync web/dist/geo "s3://$BUCKET/geo" --cache-control "public, max-age=86400" >/dev/null

echo "== running first world tick"
aws stepfunctions start-sync-execution --state-machine-arn "$SM" --region "$REGION" \
  --query '{status:status,output:output}' --output json | head -c 600; echo

aws cloudfront create-invalidation --distribution-id "$DIST" --paths "/index.html" "/data/*" >/dev/null
echo "== live at $URL"
