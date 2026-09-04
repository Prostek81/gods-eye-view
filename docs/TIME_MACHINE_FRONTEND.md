# Time Machine frontend v1

The Time Machine frontend is a thin client over the World Intelligence Event Store API. It does not reinterpret `received_at` as historical time and it does not merge live layer state with historical state.

## Local development

Run the World Intelligence sidecar on loopback (default port `8787`) and the GEV Vite client on `localhost:4173`. `server/.env.example` already allows the local Vite origins through CORS.

The browser client resolves the API in this order:

1. `VITE_WORLD_INTELLIGENCE_API_BASE` when explicitly configured.
2. On `localhost`, `127.0.0.1`, or `::1`, the same hostname on port `8787`.
3. On non-loopback deployments, Time Machine stays offline until an explicit API base is configured.

Do not put `INTERNAL_API_KEY` in a `VITE_` variable. Production deployments must place the sidecar behind an authenticated gateway/reverse proxy and expose only the intended read API to the browser.

## UX contract

- `LIVE`: ordinary GEV live layers operate normally.
- entering `HISTORY`: the controller fetches the requested snapshot first, records the exact enabled live-layer set, installs a DataLayerManager visibility guard, and then disables current live layers.
- `HISTORY`: the Event Store snapshot renders in a dedicated Cesium `CustomDataSource`. Live layer enable attempts are refused while the mode is active.
- scrubbing: the client requests a new point-in-time snapshot and a Time Machine diff. Forward and backward scrubs preserve user-direction semantics for `entered` / `exited`.
- return to `LIVE`: historical entities are cleared and the exact pre-history live-layer set is restored.

## API endpoints used

- `GET /api/v1/time-machine/coverage`
- `GET /api/v1/time-machine` with stable cursor pagination
- `GET /api/v1/time-machine/diff`
- `GET /api/v1/time-machine/history` is available through the client for later entity-detail UX.

The snapshot client repeats the same normalized filters on every cursor page, matching the server-side cursor/filter binding introduced in Time Machine API v1.
