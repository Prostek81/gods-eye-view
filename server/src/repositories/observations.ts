import { createHash } from 'node:crypto';
import type pg from 'pg';
import type { NormalizedObservation, SourceContext } from '../domain/types.js';

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function observationDedupeKey(observation: NormalizedObservation, ingestProfile: string): string {
  return stableHash([
    ingestProfile,
    observation.sourceId,
    observation.sourceObjectId,
    observation.observedAt,
    observation.sourceRevisionAt ?? '',
    observation.rawPayloadHash,
  ]);
}

export async function insertObservation(
  client: pg.PoolClient,
  observation: NormalizedObservation,
  source: SourceContext,
): Promise<{ id: string; inserted: boolean }> {
  if (!observation.rawPayloadHash) throw new Error('rawPayloadHash is required for idempotent ingest');
  if (source.sourceId !== observation.sourceId) throw new Error('source context mismatch');
  const dedupeKey = observationDedupeKey(observation, source.ingestProfile);

  const result = await client.query<{ id: string }>(`
    INSERT INTO observations (
      source_id, source_object_id, entity_type, geom, altitude_m, observed_at,
      source_revision_at, severity, event_status, title, confidence, source_quality,
      properties, raw_payload_hash, license_class, attribution, ingest_profile, dedupe_key
    ) VALUES (
      $1, $2, $3, ST_SetSRID(ST_GeomFromGeoJSON($4), 4326), $5, $6,
      $7, $8, $9::event_status, $10, $11, $12,
      $13::jsonb, $14, $15, $16, $17, $18
    )
    ON CONFLICT (dedupe_key) DO NOTHING
    RETURNING id
  `, [
    observation.sourceId,
    observation.sourceObjectId,
    observation.entityType,
    JSON.stringify(observation.geometry),
    observation.altitudeM ?? null,
    observation.observedAt,
    observation.sourceRevisionAt ?? null,
    observation.severity ?? 0,
    observation.eventStatus ?? 'unknown',
    observation.eventTitle ?? null,
    observation.confidence,
    observation.sourceQuality ?? null,
    JSON.stringify(observation.properties),
    observation.rawPayloadHash,
    source.licenseClass,
    source.attribution,
    source.ingestProfile,
    dedupeKey,
  ]);

  if (result.rows[0]) return { id: result.rows[0].id, inserted: true };
  const existing = await client.query<{ id: string }>('SELECT id FROM observations WHERE dedupe_key = $1', [dedupeKey]);
  const row = existing.rows[0];
  if (!row) throw new Error('dedupe conflict without existing observation');
  return { id: row.id, inserted: false };
}
