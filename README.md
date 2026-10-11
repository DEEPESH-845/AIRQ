# AIRQ

**India's air, live.**

AIRQ is an air-quality intelligence and public-awareness platform for India. It combines live air-quality forecasts, wind fields, active-fire detections, geographic data, and atmospheric context to help people understand where pollution is coming from, where it may travel, and when conditions may become hazardous.

The project includes a React web application, a Python data pipeline, and an AWS serverless backend for scheduled data processing, alerts, AI-assisted guidance, player experiences, and web push notifications.

## Highlights

- District-level AQI, PM2.5, and PM10 views across India
- 24-hour air-quality forecasts and historical comparisons
- Wind and planetary-boundary-layer visualizations
- Active-fire data from NASA FIRMS VIIRS
- Back-trajectory analysis for tracing potential fire-related smoke sources
- Estimated pollution attribution across vehicles, dust, industry, household sources, regional background, and fires
- Smog-raid detection for current and incoming severe conditions
- Optional web push notifications for smog raids and fire alerts
- Interactive map-based web experience built with MapLibre GL
- Scheduled AWS processing with replayable archived world snapshots
- AI-powered air-quality guidance backed by Amazon Bedrock
- Player features including proof submissions, certificates, credits, shop, teams, and leaderboard APIs

> **Important:** AIRQ's source attribution, trajectory, and pollution-share values are model estimates intended for public education and situational awareness. They are not a substitute for official measurements, regulatory decisions, medical advice, or emergency services.

## Architecture

```text
Open-Meteo Air Quality / Forecast ─┐
NASA FIRMS active fires ────────────┼─> pipeline/tick.py
GeoJSON districts and power plants ┘          │
                                             ▼
                                      world.json + archive
                                             │
                         ┌───────────────────┴───────────────────┐
                         ▼                                       ▼
                   React + Vite web app                    AWS alert workflows
                   S3 + CloudFront                         EventBridge + SNS

Web app / API ─> API Gateway HTTP API ─> Lambda functions
                                      ├─ Web push subscriptions
                                      ├─ AI guidance via Bedrock
                                      └─ Player, proof, shop, and leaderboard APIs
```

### Main components

- **`web/`** — React 19 + TypeScript frontend powered by Vite. It renders the map, air-quality views, forecasts, source-tracing visualizations, alerts, and user-facing experiences.
- **`pipeline/`** — Python data pipeline. `tick.py` fetches external feeds, computes AQI and derived indicators, generates `world.json`, and stores an archive for replay features.
- **`infra/`** — AWS SAM infrastructure and Lambda applications. The stack provisions S3, CloudFront, Step Functions, EventBridge, SNS, DynamoDB, API Gateway, Lambda, CloudWatch Logs, and optional budget alerts.
- **`web/public/geo/`** — Geographic source data used by the pipeline and frontend, including district and power-plant GeoJSON files.

## Data sources

AIRQ currently integrates the following public data sources:

- **Open-Meteo Air Quality API / Copernicus CAMS** — PM2.5 and PM10 observations/forecasts
- **Open-Meteo Forecast API** — 10 m wind, 850 hPa wind, and planetary boundary layer height
- **NASA FIRMS VIIRS** — active-fire detections and fire radiative power
- **Bundled GeoJSON datasets** — district boundaries and power-plant locations

The pipeline records source metadata in the generated world data and falls back to the most recent cached feed when a live request fails.

## Repository layout

```text
.
├── infra/
│   ├── deploy.sh             # End-to-end AWS deployment script
│   ├── template.yaml         # AWS SAM/CloudFormation infrastructure
│   ├── general/              # AI guidance Lambda
│   ├── player/               # Player, proof, and game-related Lambda
│   └── push/                 # Web push Lambda and dependencies
├── pipeline/
│   ├── tick.py               # Feed ingestion and world-data generation
│   └── test_tick.py          # Pipeline tests
└── web/
    ├── public/               # Static assets and geographic data
    ├── src/                  # React application source
    ├── package.json           # Frontend scripts and dependencies
    └── vite.config.ts        # Vite configuration
```

## Prerequisites

### Local development

- Python 3.13 or newer
- Node.js 22 or newer
- npm
- Internet access for live feed retrieval

### AWS deployment

- An AWS account
- AWS CLI configured with credentials and a default region
- AWS SAM CLI
- Python and Node.js toolchains listed above
- Permission to create/update the resources defined in `infra/template.yaml`
- Amazon Bedrock model access enabled for the configured region if using AI guidance or vision features

## Run the data pipeline locally

The pipeline is standard-library Python and can run without installing Python packages for the core world tick:

```bash
python3 pipeline/tick.py
```

By default, this writes generated data to:

```text
web/public/data/world.json
```

It also stores compressed historical snapshots under:

```text
data/archive/
```

Useful environment variables:

| Variable | Purpose | Default |
| --- | --- | --- |
| `AIRQ_GEO` | Directory containing `districts.geojson` and `plants.geojson` | `web/public/geo` |
| `AIRQ_OUT` | Local output path for `world.json` | `web/public/data/world.json` |
| `AIRQ_CACHE` | Local cache directory for feed responses | `data/cache` |
| `AIRQ_ARCHIVE` | Local archive directory | `data/archive` |
| `AIRQ_PACE_S` | Delay between Open-Meteo request batches | `12` |

The pipeline can also run as the `WorldTick` AWS Lambda. In AWS, set `AIRQ_BUCKET` to use S3 for current data, archives, and cached feeds.

## Run the web app locally

```bash
cd web
npm install
npm run dev
```

Vite will print the local development URL. To create a production build:

```bash
cd web
npm run build
```

To preview a production build locally:

```bash
cd web
npm run preview
```

Available frontend checks:

```bash
cd web
npm run lint
npm run check
```

## Deploy to AWS

The deployment script stages the Lambda packages, deploys the SAM stack, builds and uploads the web app, runs an initial world tick, and invalidates CloudFront caches.

```bash
infra/deploy.sh [alert-email]
```

For example:

```bash
infra/deploy.sh alerts@example.com
```

The script uses the configured AWS region, or `us-east-1` when no region is configured.

### Deployment options

Skip the frontend upload and first tick when needed:

```bash
SKIP_WEB=1 infra/deploy.sh
SKIP_TICK=1 infra/deploy.sh
```

The deployment creates or updates a stack named `arq`. Existing physical resources intentionally retain their `arq-*` names for compatibility with the deployed environment.

### Deployment secrets and configuration

The stack accepts these parameters:

- `AlertEmail` — optional email for monthly budget notifications
- `VapidPublicKey` — public VAPID key for browser push notifications
- `VapidPrivateKey` — private VAPID key for browser push notifications
- `CertSecret` — HMAC secret used to sign impact certificates; generated and stored locally in `.cert-secret` if absent

Do not commit `.cert-secret`, VAPID credentials, AWS credentials, or other secrets. Review `.gitignore` before deploying from a new environment.

## Scheduled processing and alerts

In AWS, the world tick is orchestrated by Step Functions and scheduled every four hours through EventBridge Scheduler:

1. Fetch and cache air-quality, weather, and fire feeds.
2. Compute district AQI, forecasts, wind fields, trajectories, and source estimates.
3. Write the current compressed `data/world.json` and an archive snapshot to S3.
4. Run field-watch and fire-alert jobs.
5. Emit `SmogRaid` events for districts crossing the configured threshold.
6. Fan out raid events through EventBridge and SNS to push-notification subscribers.

The current smog-raid threshold in the pipeline is an AQI above `300`, corresponding to the project's `Very Poor` threshold.

## API capabilities

The infrastructure exposes HTTP API routes for several optional features, including:

- Web push subscription management: `/api/subscribe`
- AI guidance: `/api/general`
- Player synchronization and deletion: `/api/player`, `/api/player/sync`, `/api/player/delete`
- Proof challenges and submissions: `/api/proof`, `/api/proof/challenge`
- Field checks and certificates: `/api/field`, `/api/field/check`, `/api/cert`
- Shop, feed, team, and leaderboard operations: `/api/shop`, `/api/feed`, `/api/team`, `/api/leaderboard`

The exact behavior and payloads are implemented in the Lambda handlers under `infra/`.

## Testing

Run the Python pipeline tests with:

```bash
python3 -m unittest discover -s pipeline -p 'test_*.py'
```

Run frontend validation with:

```bash
cd web
npm run lint
npm run check
npm run build
```

## Responsible use

AIRQ is designed to make complex environmental data easier to explore and understand. Please keep the following in mind:

- Treat modeled attribution and transport paths as estimates, not definitive source assignment.
- Confirm health and safety decisions with official local authorities and trusted medical guidance.
- Respect the terms, rate limits, and attribution requirements of each upstream data provider.
- Protect user subscriptions, proof photos, certificates, and secrets in production deployments.

## Contributing

1. Create a feature branch.
2. Make focused changes and add or update tests where appropriate.
3. Run the pipeline tests and frontend checks.
4. Verify that no credentials, generated archives, or local deployment artifacts are included.
5. Open a pull request describing the change and its operational impact.

## License

No license file is currently included in this repository. Until a license is added, the repository's contents should not be assumed to be available for unrestricted redistribution or commercial use.