import type pg from 'pg';
import type { EventQuery, NormalizedObservation, SourceContext } from '../domain/types.js';

export async function upsertEventFromObservation(
  client: pg.PoolClient,
  observationId: string,
  obs: NormalizedObservation,
  source: SourceContext,
): Promise<string> {
  const eventKey = `${obs.sourceId}:${obs.sourceObjectId}`;
  const result = await client.query<{ id: string }>(`
    INSERT INTO events (
      source_id, ingest_profile, event_key, event_type, status, title, geom, first_seen, last_seen,
      current_observed_at, current_source_revision_at, closed_at, severity, peak_severity, confidence, properties
    ) VALUES (
      $1, $2, $3, $4, $5::event_status, $6, ST_SetSRID(ST_GeomFromGeoJSON($7), 4326),
      $8, $8, $8, $9,
      CASE WHEN $5 = 'closed' THEN COALESCE($10::timestamptz, $9::timestamptz, $8::timestamptz) ELSE NULL END,
      $11, $11, $12, $13::jsonb
    )
    ON CONFLICT (ingest_profile, event_key) DO UPDATE SET
      first_seen = LEAST(events.first_seen, EXCLUDED.first_seen),
      last_seen = GREATEST(events.last_seen, EXCLUDED.last_seen),
      peak_severity = GREATEST(events.peak_severity, EXCLUDED.peak_severity),
      status = CASE WHEN
        (EXCLUDED.current_observed_at, COALESCE(EXCLUDED.current_source_revision_at, EXCLUDED.current_observed_at)) >=
        (events.current_observed_at, COALESCE(events.current_source_revision_at, events.current_observed_at))
        THEN EXCLUDED.status ELSE events.status END,
      title = CASE WHEN
        (EXCLUDED.current_observed_at, COALESCE(EXCLUDED.current_source_revision_at, EXCLUDED.current_observed_at)) >=
        (events.current_observed_at, COALESCE(events.current_source_revision_at, events.current_observed_at))
        THEN COALESCE(EXCLUDED.title, events.title) ELSE events.title END,
      geom = CASE WHEN
        (EXCLUDED.current_observed_at, COALESCE(EXCLUDED.current_source_revision_at, EXCLUDED.current_observed_at)) >=
        (events.current_observed_at, COALESCE(events.current_source_revision_at, events.current_observed_at))
        THEN EXCLUDED.geom ELSE events.geom END,
      current_observed_at = GREATEST(events.current_observed_at, EXCLUDED.current_observed_at),
      current_source_revision_at = CASE WHEN
        (EXCLUDED.current_observed_at, COALESCE(EXCLUDED.current_source_revision_at, EXCLUDED.current_observed_at)) >=
        (events.current_observed_at, COALESCE(events.current_source_revision_at, events.current_observed_at))
        THEN EXCLUDED.current_source_revision_at ELSE events.current_source_revision_at END,
      closed_at = CASE WHEN
        (EXCLUDED.current_observed_at, COALESCE(EXCLUDED.current_source_revision_at, EXCLUDED.current_observed_at)) >=
        (events.current_observed_at, COALESCE(events.current_source_revision_at, events.current_observed_at))
        THEN EXCLUDED.closed_at ELSE events.closed_at END,
      severity = CASE WHEN
        (EXCLUDED.current_observed_at, COALESCE(EXCLUDED.current_source_revision_at, EXCLUDED.current_observed_at)) >=
        (events.current_observed_at, COALESCE(events.current_source_revision_at, events.current_observed_at))
        THEN EXCLUDED.severity ELSE events.severity END,
      confidence = CASE WHEN
        (EXCLUDED.current_observed_at, COALESCE(EXCLUDED.current_source_revision_at, EXCLUDED.current_observed_at)) >=
        (events.current_observed_at, COALESCE(events.current_source_revision_at, events.current_observed_at))
        THEN EXCLUDED.confidence ELSE events.confidence END,
      properties = CASE WHEN
        (EXCLUDED.current_observed_at, COALESCE(EXCLUDED.current_source_revision_at, EXCLUDED.current_observed_at)) >=
        (events.current_observed_at, COALESCE(events.current_source_revision_at, events.current_observed_at))
        THEN events.properties || EXCLUDED.properties ELSE events.properties END,
      updated_at = now()
    RETURNING id
  `, [
    obs.sourceId,
    source.ingestProfile,
    eventKey,
    obs.entityType,
    obs.eventStatus ?? 'open',
    obs.eventTitle ?? null,
    JSON.stringify(obs.geometry),
    obs.observedAt,
    obs.sourceRevisionAt ?? null,
    obs.eventClosedAt ?? null,
    obs.severity ?? 0,
    obs.confidence,
    JSON.stringify(obs.properties),
  ]);
  const eventId = result.rows[0]!.id;
  await client.query(`
    INSERT INTO event_observations (event_id, observation_id)
    VALUES ($1, $2)
    ON CONFLICT DO NOTHING
  `, [eventId, observationId]);
  return eventId;
}

export async function queryEvents(client: pg.PoolClient, q: EventQuery, ingestProfile: string) {
  if (q.at) {
    const params: unknown[] = [ingestProfile, q.at];
    const clauses = [
      'o.ingest_profile = $1',
      'o.observed_at <= $2::timestamptz',
      '(o.source_revision_at IS NULL OR o.source_revision_at <= $2::timestamptz)',
    ];
    const add = (value: unknown) => { params.push(value); return `$${params.length}`; };
    if (q.bbox) {
      const [minLon, minLat, maxLon, maxLat] = q.bbox;
      clauses.push(`ST_Intersects(o.geom, ST_MakeEnvelope(${add(minLon)}, ${add(minLat)}, ${add(maxLon)}, ${add(maxLat)}, 4326))`);
    }
    if (q.eventTypes?.length) clauses.push(`o.entity_type = ANY(${add(q.eventTypes)}::text[])`);
    if (q.minSeverity != null) clauses.push(`o.severity >= ${add(q.minSeverity)}`);
    params.push(q.limit);
    const limitParam = `$${params.length}`;
    return client.query(`
      WITH snapshot AS (
        SELECT DISTINCT ON (o.source_id, o.source_object_id)
          o.*
        FROM observations o
        WHERE ${clauses.join(' AND ')}
        ORDER BY o.source_id, o.source_object_id,
                 o.observed_at DESC, o.source_revision_at DESC NULLS LAST, o.received_at DESC
      )
      SELECT e.id, e.event_key,
             s.entity_type AS event_type, s.event_status AS status, s.title,
             ST_AsGeoJSON(s.geom)::json AS geometry,
             e.first_seen, s.observed_at AS last_seen,
             CASE WHEN s.event_status = 'closed' THEN COALESCE(s.source_revision_at, s.observed_at) ELSE NULL END AS closed_at,
             s.severity, e.peak_severity, s.confidence,
             e.anomaly_score, s.properties, s.processed_at AS updated_at,
             jsonb_build_array(jsonb_build_object(
               'sourceId', s.source_id,
               'licenseClass', s.license_class,
               'attribution', s.attribution
             )) AS provenance
      FROM snapshot s
      JOIN event_observations eo ON eo.observation_id = s.id
      JOIN events e ON e.id = eo.event_id AND e.ingest_profile = s.ingest_profile
      ORDER BY s.severity DESC, s.observed_at DESC
      LIMIT ${limitParam}
    `, params);
  }

  const clauses: string[] = ['e.ingest_profile = $1'];
  const params: unknown[] = [ingestProfile];
  const add = (value: unknown) => { params.push(value); return `$${params.length}`; };
  if (q.from) clauses.push(`e.last_seen >= ${add(q.from)}::timestamptz`);
  if (q.to) clauses.push(`e.first_seen <= ${add(q.to)}::timestamptz`);
  if (q.bbox) {
    const [minLon, minLat, maxLon, maxLat] = q.bbox;
    clauses.push(`ST_Intersects(e.geom, ST_MakeEnvelope(${add(minLon)}, ${add(minLat)}, ${add(maxLon)}, ${add(maxLat)}, 4326))`);
  }
  if (q.eventTypes?.length) clauses.push(`e.event_type = ANY(${add(q.eventTypes)}::text[])`);
  if (q.minSeverity != null) clauses.push(`e.severity >= ${add(q.minSeverity)}`);
  params.push(q.limit);
  const limitParam = `$${params.length}`;
  return client.query(`
    SELECT e.id, e.event_key, e.event_type, e.status, e.title,
           ST_AsGeoJSON(e.geom)::json AS geometry,
           e.first_seen, e.last_seen, e.closed_at, e.severity, e.peak_severity, e.confidence,
           e.anomaly_score, e.properties, e.updated_at,
           COALESCE((
             SELECT jsonb_agg(DISTINCT jsonb_build_object(
               'sourceId', o.source_id,
               'licenseClass', o.license_class,
               'attribution', o.attribution
             ))
             FROM event_observations eo
             JOIN observations o ON o.id = eo.observation_id
             WHERE eo.event_id = e.id AND o.ingest_profile = e.ingest_profile
           ), '[]'::jsonb) AS provenance
    FROM events e
    WHERE ${clauses.join(' AND ')}
    ORDER BY e.severity DESC, e.last_seen DESC
    LIMIT ${limitParam}
  `, params);
}
