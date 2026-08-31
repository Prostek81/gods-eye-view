# API contract v0

## Provenance invariant
Every persisted observation has canonical source provenance copied from the `sources` registry: `license_class`, `attribution`, and `ingest_profile`. Clients must not infer licensing from provider names.

## GET /api/v1/events
Current/materialized event projection.

Parameters:
- `at=<ISO>` interval query against materialized event first/last bounds (not the authoritative historical snapshot endpoint)
- or `from=<ISO>&to=<ISO>` range query
- `bbox=minLon,minLat,maxLon,maxLat`
- `types=earthquake,wildfires,...`
- `minSeverity=0..100`
- `limit=1..1000`

Responses include `provenance[]` with source ID, license class and attribution.

## GET /api/v1/time-machine
Authoritative point-in-time snapshot endpoint. **Selection is based on `observed_at`, never `received_at`.**

Required: `at=<ISO>`.
Optional: `bbox`, `types`, `limit=1..5000`.

For each `(source_id, source_object_id)`, returns the latest observation whose `observed_at <= at`, preferring the latest source revision when observations share an observation timestamp. Each item includes `observed_at`, `source_revision_at`, `received_at`, severity/status/title and provenance.

## GET /api/v1/timeline
Required: `from`, `to`. Optional: `bbox`, `bucket=5m|15m|1h|6h|1d`.

Histogram buckets are calculated from **`observations.observed_at`**. The response declares `basis: "observed_at"` and includes both raw observation count and distinct source-entity count.

## POST /api/v1/assets

```json
{
  "externalKey": "port-oslo",
  "name": "Port of Oslo",
  "assetType": "port",
  "geometry": {"type":"Point","coordinates":[10.75,59.90]},
  "importance": 0.9,
  "properties": {"owner":"example"}
}
```

## POST /internal/v1/observations
Requires `x-internal-api-key`. `rawPayloadHash` is mandatory. Licensing and attribution are not accepted from the caller; they are resolved from the server-side source registry. Source policy is enforced before persistence.

## POST /internal/v1/anomalies/event-count
Header: `x-internal-api-key`.

```json
{
  "bbox": [5, 55, 15, 65],
  "windowMinutes": 60,
  "lookbackDays": 30,
  "eventType": "earthquake"
}
```

The detector compares the current event count to equivalent historical windows and stores mean/stddev/z-score/percentile/score evidence.

## POST /internal/v1/risk/recompute
Header: `x-internal-api-key`.

```json
{"radiusKm": 500}
```

Computes nearby open-event risk for all assets.

## Watchlists
- `POST /api/v1/watchlists`
- `GET /api/v1/watchlists`
- `POST /api/v1/watchlists/:id/assets`
- `GET /api/v1/watchlists/:id/risk`
