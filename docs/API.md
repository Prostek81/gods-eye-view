# API contract v1

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

# Time Machine API

Historical reads have two semantic clocks plus one transport-consistency boundary:
- `observed_at`: when the real-world state was observed; this is the authoritative replay clock.
- `source_revision_at`: when a provider revision became knowable. A snapshot at time `T` never exposes a revision with `source_revision_at > T`.
- `read_cutoff`: a server-generated ingestion-visibility cutoff used only to keep cursor pagination stable across requests.

`received_at` is **not** the replay clock. It is used only as `received_at <= read_cutoff` while continuing a paginated snapshot, so late-arriving ingests cannot reorder or duplicate entities between pages.

## GET /api/v1/time-machine
Authoritative point-in-time snapshot.

Required:
- `at=<ISO>`

Optional:
- `bbox=minLon,minLat,maxLon,maxLat`
- `types=earthquake,wildfires,...`
- `minSeverity=0..100`
- `limit=1..5000`
- `cursor=<opaque>`

The server first selects the latest knowable observation for every `(source_id, source_object_id)` and **only then** applies `bbox`, `types`, and `minSeverity`. This prevents an older matching observation from being resurrected when the entity's latest state no longer matches the filter.

The first page receives a database-generated `read_cutoff`. It is embedded into the opaque cursor and reused for every following page. Results are stably ordered by severity, observation time, source and source-object ID. `page.next_cursor` can be passed to the next request with the same `at`; cursors are bound to their `at` timestamp and ingestion cutoff.

## GET /api/v1/time-machine/coverage
Returns the stored historical coverage available for replay:
- `min_observed_at`
- `max_observed_at`
- `observation_count`
- `distinct_entity_count`
- `by_source`
- `by_type`

Optional filters: `bbox`, `types`, `minSeverity`.

## GET /api/v1/time-machine/history
Returns the ordered observation/revision history for one source entity.

Required:
- `sourceId`
- `sourceObjectId`

Optional:
- `from`, `to`: observation-time range
- `asOf`: knowledge cutoff; hides source revisions newer than `asOf`
- `limit=1..5000`

This endpoint is intended for entity replay/trails and audit inspection.

## GET /api/v1/time-machine/diff
Compares two authoritative snapshots and returns only changed membership/state.

Required:
- `from=<ISO>`
- `to=<ISO>` with `from < to`

Optional:
- `bbox`
- `types`
- `minSeverity`
- `limit=1..5000`

`change_type` values:
- `entered`: entity is in the filtered `to` snapshot but not the filtered `from` snapshot
- `exited`: entity is in the filtered `from` snapshot but not the filtered `to` snapshot
- `changed`: entity exists in both but its selected observation/revision changed

Each row contains `from_state` and `to_state` with provenance and temporal metadata.

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
