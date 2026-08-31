import type { FastifyInstance } from 'fastify';
import { db } from '../db.js';
import { config } from '../config.js';
import { finiteNumber, httpError, requireBbox, requireIsoTimestamp } from '../validation.js';

const BUCKETS = new Set(['5m','15m','1h','6h','1d']);
const BUCKET_SQL: Record<string, string> = {
  '5m': `date_bin(interval '5 minutes', o.observed_at, timestamptz '2001-01-01')`,
  '15m': `date_bin(interval '15 minutes', o.observed_at, timestamptz '2001-01-01')`,
  '1h': `date_bin(interval '1 hour', o.observed_at, timestamptz '2001-01-01')`,
  '6h': `date_bin(interval '6 hours', o.observed_at, timestamptz '2001-01-01')`,
  '1d': `date_bin(interval '1 day', o.observed_at, timestamptz '2001-01-01')`,
};

export async function timelineRoutes(app: FastifyInstance) {
  app.get('/api/v1/timeline', async (request) => {
    const q = request.query as Record<string, string | undefined>;
    if (!q.from || !q.to) throw httpError(400, 'from and to are required');
    const from = requireIsoTimestamp(q.from, 'from');
    const to = requireIsoTimestamp(q.to, 'to');
    if (Date.parse(from) >= Date.parse(to)) throw httpError(400, 'from must be before to');
    const bucket = q.bucket ?? '1h';
    if (!BUCKETS.has(bucket)) throw httpError(400, 'bucket must be one of 5m,15m,1h,6h,1d');
    const expr = BUCKET_SQL[bucket]!;
    const params: unknown[] = [config.dataProfile, from, to];
    let spatial = '';
    if (q.bbox) {
      const bbox = requireBbox(q.bbox);
      params.push(...bbox);
      spatial = `AND ST_Intersects(o.geom, ST_MakeEnvelope($4,$5,$6,$7,4326))`;
    }
    const result = await db.query(`
      WITH filtered AS (
        SELECT o.*, ${expr} AS bucket
        FROM observations o
        WHERE o.ingest_profile = $1
          AND o.observed_at >= $2::timestamptz
          AND o.observed_at < $3::timestamptz
          ${spatial}
      ), type_counts AS (
        SELECT bucket, entity_type, count(*)::int AS n
        FROM filtered
        GROUP BY bucket, entity_type
      ), type_json AS (
        SELECT bucket, jsonb_object_agg(entity_type, n) AS by_type
        FROM type_counts
        GROUP BY bucket
      )
      SELECT f.bucket,
             count(*)::int AS observation_count,
             count(DISTINCT (f.source_id, f.source_object_id))::int AS distinct_entity_count,
             max(f.severity)::float8 AS max_severity,
             avg(f.severity)::float8 AS avg_severity,
             tj.by_type
      FROM filtered f
      LEFT JOIN type_json tj USING (bucket)
      GROUP BY f.bucket, tj.by_type
      ORDER BY f.bucket ASC
    `, params);
    return { basis: 'observed_at', bucket, from, to, items: result.rows };
  });

  app.get('/api/v1/time-machine', async (request) => {
    const q = request.query as Record<string, string | undefined>;
    if (!q.at) throw httpError(400, 'at is required');
    const at = requireIsoTimestamp(q.at, 'at');
    const params: unknown[] = [config.dataProfile, at];
    const clauses = [
      `o.ingest_profile = $1`,
      `o.observed_at <= $2::timestamptz`,
      `(o.source_revision_at IS NULL OR o.source_revision_at <= $2::timestamptz)`,
    ];
    const add = (value: unknown) => { params.push(value); return `$${params.length}`; };
    if (q.bbox) {
      const [minLon, minLat, maxLon, maxLat] = requireBbox(q.bbox);
      clauses.push(`ST_Intersects(o.geom, ST_MakeEnvelope(${add(minLon)},${add(minLat)},${add(maxLon)},${add(maxLat)},4326))`);
    }
    const types = q.types?.split(',').map(v => v.trim()).filter(Boolean).slice(0, 50);
    if (types?.length) clauses.push(`o.entity_type = ANY(${add(types)}::text[])`);
    const limit = q.limit == null ? 1000 : Math.trunc(finiteNumber(q.limit, 'limit', 1, 5000));
    params.push(limit);
    const limitParam = `$${params.length}`;

    const result = await db.query(`
      SELECT * FROM (
        SELECT DISTINCT ON (o.source_id, o.source_object_id)
          o.id, o.source_id, o.source_object_id, o.entity_type,
          ST_AsGeoJSON(o.geom)::json AS geometry, o.altitude_m,
          o.observed_at, o.source_revision_at, o.received_at,
          o.severity, o.event_status, o.title, o.confidence, o.source_quality,
          o.properties, o.license_class, o.attribution
        FROM observations o
        WHERE ${clauses.join(' AND ')}
        ORDER BY o.source_id, o.source_object_id, o.observed_at DESC, o.source_revision_at DESC NULLS LAST, o.received_at DESC
      ) snapshot
      ORDER BY severity DESC, observed_at DESC
      LIMIT ${limitParam}
    `, params);
    return { basis: 'observed_at', revision_visibility: 'source_revision_at<=at', at, items: result.rows, count: result.rowCount ?? 0 };
  });
}
