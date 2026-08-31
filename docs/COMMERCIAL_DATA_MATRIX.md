# Commercial data matrix — operational v0

**Important:** this is an engineering release policy, not legal advice. Re-verify provider terms/contracts at launch.

| Source | Default production state | Storage policy | Reason / action |
|---|---|---|---|
| USGS | ALLOW | normalized | Public-domain U.S. government data per upstream documentation |
| NASA EONET | ALLOW | normalized | Suitable first natural-event feed; retain source/disclaimer metadata |
| GDELT | ALLOW | normalized | Upstream GEV documents commercial use with citation; linked publisher content remains third-party |
| Open-Meteo | ALLOW + attribution | normalized | CC BY 4.0 attribution requirements |
| CelesTrak | ALLOW + citation | normalized | Citation requested |
| Launch Library 2 | ALLOW with terms | normalized | Respect provider limits and value-add expectations |
| Google Maps / 3D Tiles | CONDITIONAL | **no persistent storage** | Visualization under Google Maps Platform terms; restrict key/billing |
| TomTom | CONDITIONAL | transient | Appropriate plan/contract and retention rules required |
| OSM | CONDITIONAL | normalized | ODbL compliance path required |
| adsb.lol | CONDITIONAL | normalized | ODbL compliance path required |
| OpenSky | BLOCK default | none | Upstream GEV describes non-commercial / separate agreement path |
| Google News RSS | BLOCK | none | Upstream GEV describes personal/noncommercial restriction |
| AISStream | DEV ONLY | none | Upstream GEV notes beta/no formal ToS; production dependency requires explicit terms |
| TeleGeography bundled cable data | REMOVE/BLOCK | none | CC BY-NC-SA NonCommercial |

## Clean profile rule

A source is not enabled merely because it is technically reachable. It must pass **all** of:

1. commercial-rights review
2. attribution implementation
3. retention/storage rule
4. API quota/cost rule
5. provenance mapping
6. failure/freshness semantics

Until all six are explicit, disposition is `conditional` or `blocked`.
