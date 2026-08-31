# Integration with God's Eye View

This MVP does not copy the upstream GEV source tree. Apply it to a user-owned fork.

## Phase A — commercial clean fork

1. Fork `bilawalsidhu/gods-eye-view` into your GitHub account.
2. Keep the upstream MIT license and required notices.
3. Remove `src/data/local_data/telegeography_submarine_cables/` from the commercial branch unless separately licensed.
4. Disable OpenSky and Google News RSS in the commercial build profile.
5. Treat AISStream as development-only until explicit production/commercial terms are verified.
6. Introduce `commercial-clean/frontend/sourceGate.js` at the data-loader/layer activation boundary.
7. Run `commercial-clean-scan.mjs` in CI.

## Phase B — backend separation

Do **not** migrate every route from `vite.config.js` at once.

Migration order:
1. new historical sources (USGS + EONET) -> new Fastify backend only
2. Time Machine UI -> Fastify `/api/v1/events` + `/api/v1/timeline`
3. assets/risk/anomalies -> Fastify only
4. move individual legacy GEV provider proxies one at a time behind adapter contracts
5. delete the corresponding Vite route after parity tests

This avoids a high-risk flag-day rewrite.

## Frontend contract

The Cesium client should stop depending on provider-specific schemas. It should consume normalized GeoJSON-like event payloads:

```json
{
  "id": "uuid",
  "event_type": "earthquake",
  "status": "open",
  "title": "M5.2 — ...",
  "geometry": {"type":"Point","coordinates":[10.2,63.4]},
  "first_seen": "...",
  "last_seen": "...",
  "severity": 65,
  "confidence": 0.98,
  "anomaly_score": 82,
  "properties": {}
}
```

The frontend remains responsible for rendering/interpolation. The backend becomes responsible for memory, policy, correlation and history.

## Time Machine UI

Map slider behavior:
- LIVE -> regular newest event query
- historical point -> `/api/v1/events?at=<ISO>&bbox=...`
- timeline histogram -> `/api/v1/timeline?from=...&to=...&bucket=...&bbox=...`

The client should request only the viewport/time slice currently visible; do not ship the full historical database to Cesium.
