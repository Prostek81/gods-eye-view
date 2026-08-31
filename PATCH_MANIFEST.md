# PR1 Patch Manifest

Allowed PR1 paths:

- `server/`
- `db/migrations/`
- `commercial-clean/`
- new World Intelligence documents under `docs/`
- `apply-to-gev.sh`
- `VALIDATION.md`
- `PATCH_MANIFEST.md`
- `UPSTREAM_BASE.md`

## Scope

PR1 introduces:

- Fastify/TypeScript sidecar backend;
- PostgreSQL/PostGIS event memory;
- Redis/BullMQ 5.x ingest plumbing;
- source/license/storage policy registry;
- USGS 24 h earthquake ingest;
- NASA EONET 30 d open+closed event ingest;
- idempotent observations and revision-aware current event state;
- Time Machine with `observed_at` semantics and source-revision visibility;
- anomaly v0 and risk v0;
- assets/watchlists;
- internal authentication boundary;
- bounded provider fetches and request validation;
- core, contract and integration-test scaffolding.

## Explicitly out of scope

- changes to `vite.config.js`;
- changes to `src/ui.js`, Cesium renderer, HUD or voice agent;
- migration of legacy GEV providers onto the sidecar;
- removal of TeleGeography from the upstream tree;
- public user auth/RBAC/billing;
- `.github/workflows/*` (reserved for PR2).
