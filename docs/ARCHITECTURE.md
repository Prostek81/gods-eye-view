# Architecture — World Intelligence AI MVP

## Principle

The 3D globe is a **presentation surface**. The product of record is the historical event memory and the derived intelligence layer.

```text
USGS / NASA EONET / future providers
        │
        ▼
Source adapters
        │ normalized observations
        ▼
BullMQ ingestion
        │
        ▼
PostgreSQL + PostGIS
  observations ──► events
        │             │
        │             ├──► anomaly detector
        │             │
        │             └──► asset risk engine
        │
        └─────────────► Time Machine API
                         │
                         ▼
                  GEV / Cesium frontend
                         │
                         ▼
                    AI Analyst
```

## Invariants

1. Every datum rendered as intelligence has `source`, `observed_at`, `confidence` and attribution/provenance metadata.
2. Raw provider payloads are not persisted by default. Store normalized fields + a hash unless the source policy explicitly permits raw storage.
3. A language model does **not** decide whether an anomaly exists. Statistical/algorithmic detectors produce evidence first; the AI Analyst explains that evidence.
4. Point-in-time queries are first-class. `events?at=...` is part of the API, not a UI replay hack.
5. Commercially uncertain sources are off by default.

## Event model

`observation` = one source-backed measurement at one time.

`event` = a durable real-world phenomenon derived from one or more observations. `severity` is current/latest; `peak_severity` preserves the maximum seen value.

`anomaly` = a statistical deviation in a metric over a defined scope/window.

`risk_score` = effect of an event on a user asset.

`alert` = a decision/action surface created from risk/anomaly rules.

## Risk v0

Conservative multiplicative model:

`risk = severity × source confidence × proximity × asset importance`

All factors are normalized to `[0,1]`, then multiplied by 100. This deliberately suppresses weak-evidence or distant events.

## Anomaly v0

- historical mean baseline
- sample standard deviation
- z-score
- empirical percentile rank
- combined score (`70% z-component + 30% tail percentile`)
- minimum baseline sample gate

The first concrete detector is event-count elevation in a bounding box compared with the same preceding window across prior days.
