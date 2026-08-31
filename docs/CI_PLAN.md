# CI gate plan

PR1 is intentionally restricted to the approved payload (`server/`, `db/migrations/`, `commercial-clean/`, `docs/`, and the four root integration/validation files). Therefore `.github/workflows/*` is **not** part of PR1.

The branch is nevertheless prepared with callable scripts matching the future required checks:

1. `npm run typecheck` — TypeScript compile check
2. `npm run test` — core tests against real source modules
3. `npm run commercial-clean-scan` — commercial policy hard blockers
4. `npm run syntax` — JS + shell syntax
5. `npm run migration:dry-run` — applies all migrations in one DB transaction and rolls back

Immediately after PR1 exists, add a separate CI-only PR containing `.github/workflows/world-intelligence-ci.yml`, then mark these five jobs required in branch protection. Keeping workflow metadata out of PR1 preserves the requested payload boundary.

Suggested GitHub Actions services:
- PostGIS: `postgis/postgis:17-3.5`
- Redis: `redis:7-alpine`
- Node: 24.x

Do not migrate BullMQ to 6.x in MVP.
