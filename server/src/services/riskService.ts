import { db } from '../db.js';
import { calculateRisk } from '../domain/risk.js';
import { config } from '../config.js';

export async function recomputeRisk(radiusKm: number) {
  const pairs = await db.query<{
    asset_id: string;
    event_id: string;
    importance: number;
    severity: number;
    confidence: number;
    distance_km: number;
  }>(`
    SELECT
      a.id AS asset_id,
      e.id AS event_id,
      a.importance,
      e.severity,
      e.confidence,
      ST_Distance(a.geom::geography, e.geom::geography) / 1000.0 AS distance_km
    FROM assets a
    JOIN events e
      ON e.status <> 'closed'
     AND e.ingest_profile = $2
     AND ST_DWithin(a.geom::geography, e.geom::geography, $1 * 1000.0)
  `, [radiusKm, config.dataProfile]);

  let updated = 0;
  for (const row of pairs.rows) {
    const risk = calculateRisk({
      severity: Number(row.severity),
      eventConfidence: Number(row.confidence),
      distanceKm: Number(row.distance_km),
      impactRadiusKm: radiusKm,
      assetImportance: Number(row.importance),
    });
    await db.query(`
      INSERT INTO risk_scores (
        asset_id, event_id, score, severity_component, confidence_component,
        proximity_component, importance_component, distance_km, explanation
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
      ON CONFLICT (asset_id, event_id) DO UPDATE SET
        score = EXCLUDED.score,
        severity_component = EXCLUDED.severity_component,
        confidence_component = EXCLUDED.confidence_component,
        proximity_component = EXCLUDED.proximity_component,
        importance_component = EXCLUDED.importance_component,
        distance_km = EXCLUDED.distance_km,
        explanation = EXCLUDED.explanation,
        calculated_at = now()
    `, [
      row.asset_id, row.event_id, risk.score,
      risk.severityComponent, risk.confidenceComponent,
      risk.proximityComponent, risk.importanceComponent,
      Number(row.distance_km),
      JSON.stringify({ model: 'multiplicative-v0', impactRadiusKm: radiusKm }),
    ]);
    updated += 1;
  }
  return { pairs: pairs.rowCount ?? 0, updated };
}
