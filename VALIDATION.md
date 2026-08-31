# PR1 Validation — World Intelligence Event Store MVP

Baseline: upstream God's Eye View commit `314a0e1c2ef668cb110674b737e19a44ff6fc1ef` (2026-08-28).
Branch: `feat/world-intelligence-event-store-mvp`.

## Verified locally

- Full GEV archive restored from `gods-eye-view-OSINT.zip` and matched to the upstream baseline.
- PR1 is additive: no edits to existing Cesium/UI/HUD/voice/runtime files.
- 35 TypeScript source/test files syntactically transpiled with TypeScript 5.8.3: **0 diagnostics**.
- Dependency-free core + contract tests executed after transpilation on local Node 22.16.0: **18/18 PASS**.
- `commercial-clean/scripts/commercial-clean-scan.mjs`: **PASS**.
- JavaScript/shell syntax checks: **PASS**.
- `commercial-release-scan.mjs`: **EXPECTED FAIL** while legacy upstream TeleGeography remains bundled and legacy OpenSky/Google News/AISStream paths remain present. This is a release gate, not a PR1 gate.

## Security/data invariants covered

- source policy is enforced before provider network fetch for persistent workers;
- `none`, `transient_only`, blocked and incompatible dev-only sources cannot persist into the Event Store;
- every mutation route requires `x-internal-api-key`;
- production/non-loopback service access requires the internal gateway key;
- Time Machine uses `observed_at` and hides source revisions whose `source_revision_at` is later than the requested historical instant;
- dedupe key includes data profile, source identity, `observed_at`, `source_revision_at`, and raw payload SHA-256;
- late older observations cannot regress the current event state;
- USGS normalization preserves event/revision timestamps and depth;
- EONET uses `status=all` and represents closure time as a source revision;
- provider fetches use fixed URLs, redirect rejection, 15 s timeout and a 25 MiB decoded response cap;
- geometry, bbox, UUID, timestamp, confidence, severity and SHA-256 inputs are validated;
- server-side source registry supplies license class and attribution to stored observations.

## Not verified locally — required CI/merge gates

The current execution environment has Node 22.16.0, no Docker/PostGIS/Redis runtime, and npm registry access timed out. Upstream GEV requires Node 24.14.x or 26.x.

Therefore the following are deliberately **not** marked PASS:

1. `npm ci` for the sidecar (requires a generated/committed `server/package-lock.json`);
2. full `npm run typecheck` against installed Fastify/pg/BullMQ/ioredis typings;
3. migration dry-run against PostGIS;
4. real PostGIS idempotency/event-state/Time Machine integration tests;
5. Redis connectivity/BullMQ integration test;
6. full Fastify runtime smoke on Node 24;
7. upstream GEV test suite on Node 24.

`server/package-lock.json` was **not fabricated**. It must be generated from the pinned/approved dependency set in a networked Node 24 environment and then committed before switching CI to `npm ci`.
