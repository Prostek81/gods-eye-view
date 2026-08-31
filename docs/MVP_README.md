# World Intelligence AI — Commercial Clean Fork + Event Store MVP

**Status:** MVP scaffold (2026-08-31)

This package is an **overlay/refactor target** for `bilawalsidhu/gods-eye-view`, not a republished copy of the upstream repository. It contains the new production-oriented backend, PostGIS event memory, commercial source policy, Time Machine API, anomaly detector v0 and risk engine v0.

## Product boundary

Keep from GEV:
- Cesium / map stack
- entity tracking and interpolation
- layer UX
- freshness/provenance semantics
- attribution display
- voice / AI control surface

Replace or add:
- replace Vite-as-backend with Fastify API
- persist normalized observations to PostGIS
- derive events and anomalies from historical memory
- calculate asset risk
- expose Time Machine queries
- gate data sources by commercial policy

## MVP stack

- Node.js 24+
- TypeScript
- Fastify 5
- PostgreSQL 17 + PostGIS 3.5
- Redis 7
- BullMQ 5.x (stable line)
- Docker Compose for local development

## Quick start

```bash
cp .env.world-intelligence.example .env
docker compose -f docker-compose.world-intelligence.yml up -d postgres redis
cd server
npm install
npm run db:migrate
npm run dev
```

In another shell:

```bash
cd server
npm run worker
npm run enqueue:bootstrap
```

Then:

```bash
curl http://localhost:8787/health
curl 'http://localhost:8787/api/v1/events?limit=20'
curl 'http://localhost:8787/api/v1/timeline?from=2026-08-30T00:00:00Z&to=2026-08-31T00:00:00Z&bucket=1h'
```

## Commercial Clean profile

Run this **inside a real GEV fork** before a production build:

```bash
node commercial-clean/scripts/commercial-clean-scan.mjs /path/to/gods-eye-view
```

The scan hard-fails on known blocked-by-default assets/sources such as the bundled TeleGeography dataset and warns on source modules that require replacement or a separate commercial agreement.

See:
- `commercial-clean/source-policy.json`
- `docs/COMMERCIAL_DATA_MATRIX.md`
- `docs/INTEGRATION_WITH_GEV.md`

## API implemented in this MVP

- `POST /internal/v1/observations` — normalized ingestion endpoint
- `GET /api/v1/events` — range or point-in-time (`at=`) query
- `GET /api/v1/events/:id`
- `GET /api/v1/timeline` — Time Machine bucket summary
- `POST /api/v1/assets`
- `GET /api/v1/assets`
- `GET /api/v1/assets/:id/risk`
- `POST/GET /api/v1/watchlists` + watchlist asset/risk endpoints
- `GET /api/v1/anomalies`
- `POST /internal/v1/anomalies/event-count` — historical baseline detector
- `POST /internal/v1/risk/recompute` — recompute event-to-asset risk

## Ingestion adapters included

- USGS earthquakes
- NASA EONET natural events

Both normalize into the same observation/event model. Additional GEV sources should be migrated behind the same adapter contract only after their commercial policy is resolved.

## Non-goals of this MVP

- no Kafka
- no Kubernetes
- no multi-region architecture
- no billing
- no SSO
- no enterprise tenancy
- no attempt to redistribute upstream third-party datasets

Those are intentionally deferred until the event-memory product proves demand.


## PR1 smoke test
Run from `server/` on Node 24 with Docker:

```bash
docker compose up -d postgres redis
npm install
npm run migrate
npm run test
npm run commercial-clean-scan
npm run typecheck
npm run syntax
npm run migration:dry-run
npm run dev:server
```

Time Machine is explicitly based on `observed_at`; `received_at` remains ingestion provenance only.
