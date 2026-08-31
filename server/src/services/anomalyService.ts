import { db } from '../db.js';
import { config } from '../config.js';
import { evaluateAnomaly } from '../domain/anomaly.js';

export interface EventCountDetectorInput {
  bbox: [number, number, number, number];
  windowMinutes?: number;
  lookbackDays?: number;
  eventType?: string;
}

export async function detectEventCountAnomaly(input: EventCountDetectorInput) {
  const windowMinutes = Math.max(5, Math.min(1440, input.windowMinutes ?? 60));
  const lookbackDays = Math.max(7, Math.min(180, input.lookbackDays ?? 30));
  const [minLon, minLat, maxLon, maxLat] = input.bbox;

  const current = await db.query<{ count: string }>(`
    SELECT count(*)::text AS count
    FROM events
    WHERE ingest_profile = $1
      AND first_seen >= now() - ($2::int * interval '1 minute')
      AND ST_Intersects(geom, ST_MakeEnvelope($3,$4,$5,$6,4326))
      AND ($7::text IS NULL OR event_type = $7)
  `, [config.dataProfile, windowMinutes, minLon, minLat, maxLon, maxLat, input.eventType ?? null]);

  const baseline = await db.query<{ count: string }>(`
    WITH days AS (
      SELECT generate_series(1, $2::int) AS day_offset
    ), windows AS (
      SELECT
        d.day_offset,
        now() - (d.day_offset * interval '1 day') - ($3::int * interval '1 minute') AS start_at,
        now() - (d.day_offset * interval '1 day') AS end_at
      FROM days d
    )
    SELECT w.day_offset, count(e.id)::text AS count
    FROM windows w
    LEFT JOIN events e
      ON e.ingest_profile = $1
     AND e.first_seen >= w.start_at
     AND e.first_seen < w.end_at
     AND ST_Intersects(e.geom, ST_MakeEnvelope($4,$5,$6,$7,4326))
     AND ($8::text IS NULL OR e.event_type = $8)
    GROUP BY w.day_offset
    ORDER BY w.day_offset
  `, [config.dataProfile, lookbackDays, windowMinutes, minLon, minLat, maxLon, maxLat, input.eventType ?? null]);

  const baselineValues = baseline.rows.map(r => Number(r.count));
  if (baselineValues.length < config.anomalyMinSamples) {
    return { status: 'insufficient_baseline', required: config.anomalyMinSamples, available: baselineValues.length } as const;
  }

  const currentValue = Number(current.rows[0]?.count ?? 0);
  const evaluation = evaluateAnomaly(currentValue, baselineValues, 'high');
  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - windowMinutes * 60_000);
  const scopeKey = input.bbox.join(',');

  const inserted = await db.query<{ id: string }>(`
    INSERT INTO anomalies (
      ingest_profile, scope_type, scope_key, metric, current_value, baseline_mean, baseline_stddev,
      percentile, z_score, score, confidence, window_start, window_end, evidence
    ) VALUES ($1, 'bbox', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)
    RETURNING id
  `, [
    config.dataProfile,
    scopeKey,
    input.eventType ? `event_count:${input.eventType}` : 'event_count:all',
    currentValue,
    evaluation.mean,
    evaluation.stddev,
    evaluation.percentile,
    evaluation.zScore,
    evaluation.score,
    evaluation.confidence,
    windowStart.toISOString(),
    windowEnd.toISOString(),
    JSON.stringify({ baselineValues, windowMinutes, lookbackDays, bbox: input.bbox }),
  ]);

  return { status: 'ok', id: inserted.rows[0]!.id, currentValue, ...evaluation } as const;
}
