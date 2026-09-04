import { db } from '../db.js';
import type { TimeMachineCursor } from '../domain/timeMachineCursor.js';

export type Bbox = [number, number, number, number];

export interface TimeMachineFilters {
  bbox?: Bbox;
  eventTypes?: string[];
  minSeverity?: number;
}

export interface SnapshotInput extends TimeMachineFilters {
  at: string;
  readCutoff: string;
  limit: number;
  cursor?: TimeMachineCursor;
}

export interface HistoryInput {
  sourceId: string;
  sourceObjectId: string;
  from?: string;
  to?: string;
  asOf?: string;
  limit: number;
}

export interface DiffInput extends TimeMachineFilters {
  from: string;
  to: string;
  limit: number;
}

function addParam(params: unknown[], value: unknown): string {
  params.push(value);
  return `$${params.length}`;
}

function filterClauses(alias: string, filters: TimeMachineFilters, params: unknown[]): string[] {
  const clauses: string[] = [];
  if (filters.bbox) {
    const [minLon, minLat, maxLon, maxLat] = filters.bbox;
    clauses.push(`ST_Intersects(${alias}.geom, ST_MakeEnvelope(${addParam(params, minLon)},${addParam(params, minLat)},${addParam(params, maxLon)},${addParam(params, maxLat)},4326))`);
  }
  if (filters.eventTypes?.length) clauses.push(`${alias}.entity_type = ANY(${addParam(params, filters.eventTypes)}::text[])`);
  if (filters.minSeverity != null) clauses.push(`COALESCE(${alias}.severity, -1) >= ${addParam(params, filters.minSeverity)}`);
  return clauses;
}

const LATEST_COLUMNS = `
  o.id, o.source_id, o.source_object_id, o.entity_type, o.geom, o.altitude_m,
  o.observed_at, o.source_revision_at, o.received_at,
  o.severity::float8 AS severity, o.event_status, o.title, o.confidence::float8 AS confidence,
  o.source_quality::float8 AS source_quality, o.properties, o.license_class, o.attribution
`;

export async function queryTimeMachineReadCutoff(): Promise<string> {
  const result = await db.query('SELECT clock_timestamp() AS now');
  return new Date(result.rows[0].now as string | Date).toISOString();
}

export async function queryTimeMachineSnapshot(input: SnapshotInput, profile: string) {
  const params: unknown[] = [profile, input.at, input.readCutoff];
  const filters = filterClauses('s', input, params);
  const outerClauses = [...filters];

  if (input.cursor) {
    const severity = addParam(params, input.cursor.severity);
    const observedAt = addParam(params, input.cursor.observedAt);
    const sourceId = addParam(params, input.cursor.sourceId);
    const sourceObjectId = addParam(params, input.cursor.sourceObjectId);
    outerClauses.push(`(
      COALESCE(s.severity, -1) < ${severity}
      OR (COALESCE(s.severity, -1) = ${severity} AND s.observed_at < ${observedAt}::timestamptz)
      OR (COALESCE(s.severity, -1) = ${severity} AND s.observed_at = ${observedAt}::timestamptz AND s.source_id > ${sourceId})
      OR (COALESCE(s.severity, -1) = ${severity} AND s.observed_at = ${observedAt}::timestamptz AND s.source_id = ${sourceId} AND s.source_object_id > ${sourceObjectId})
    )`);
  }

  const limitParam = addParam(params, input.limit + 1);
  const result = await db.query(`
    WITH latest AS (
      SELECT DISTINCT ON (o.source_id, o.source_object_id)
        ${LATEST_COLUMNS}
      FROM observations o
      WHERE o.ingest_profile = $1
        AND o.observed_at <= $2::timestamptz
        AND (o.source_revision_at IS NULL OR o.source_revision_at <= $2::timestamptz)
        AND o.received_at <= $3::timestamptz
      ORDER BY o.source_id, o.source_object_id, o.observed_at DESC, o.source_revision_at DESC NULLS LAST, o.received_at DESC
    )
    SELECT s.id, s.source_id, s.source_object_id, s.entity_type,
           ST_AsGeoJSON(s.geom)::json AS geometry, s.altitude_m,
           s.observed_at, s.source_revision_at, s.received_at,
           s.severity, s.event_status, s.title, s.confidence, s.source_quality,
           s.properties, s.license_class, s.attribution
    FROM latest s
    ${outerClauses.length ? `WHERE ${outerClauses.join(' AND ')}` : ''}
    ORDER BY COALESCE(s.severity, -1) DESC, s.observed_at DESC, s.source_id ASC, s.source_object_id ASC
    LIMIT ${limitParam}
  `, params);
  const rows = result.rows;
  const hasMore = rows.length > input.limit;
  return { rows: hasMore ? rows.slice(0, input.limit) : rows, hasMore };
}

export async function queryTimeMachineCoverage(filters: TimeMachineFilters, profile: string) {
  const params: unknown[] = [profile];
  const clauses = [`o.ingest_profile = $1`, ...filterClauses('o', filters, params)];
  const result = await db.query(`
    WITH filtered AS (
      SELECT o.source_id, o.source_object_id, o.entity_type, o.observed_at
      FROM observations o
      WHERE ${clauses.join(' AND ')}
    ), source_counts AS (
      SELECT source_id, count(*)::int AS n FROM filtered GROUP BY source_id
    ), type_counts AS (
      SELECT entity_type, count(*)::int AS n FROM filtered GROUP BY entity_type
    )
    SELECT min(observed_at) AS min_observed_at,
           max(observed_at) AS max_observed_at,
           count(*)::int AS observation_count,
           count(DISTINCT (source_id, source_object_id))::int AS distinct_entity_count,
           COALESCE((SELECT jsonb_object_agg(source_id, n) FROM source_counts), '{}'::jsonb) AS by_source,
           COALESCE((SELECT jsonb_object_agg(entity_type, n) FROM type_counts), '{}'::jsonb) AS by_type
    FROM filtered
  `, params);
  return result.rows[0] ?? null;
}

export async function queryTimeMachineHistory(input: HistoryInput, profile: string) {
  const params: unknown[] = [profile, input.sourceId, input.sourceObjectId];
  const clauses = [
    `o.ingest_profile = $1`,
    `o.source_id = $2`,
    `o.source_object_id = $3`,
  ];
  if (input.from) clauses.push(`o.observed_at >= ${addParam(params, input.from)}::timestamptz`);
  if (input.to) clauses.push(`o.observed_at <= ${addParam(params, input.to)}::timestamptz`);
  if (input.asOf) {
    const asOf = addParam(params, input.asOf);
    clauses.push(`o.observed_at <= ${asOf}::timestamptz`);
    clauses.push(`(o.source_revision_at IS NULL OR o.source_revision_at <= ${asOf}::timestamptz)`);
  }
  const limitParam = addParam(params, input.limit);
  const result = await db.query(`
    SELECT o.id, o.source_id, o.source_object_id, o.entity_type,
           ST_AsGeoJSON(o.geom)::json AS geometry, o.altitude_m,
           o.observed_at, o.source_revision_at, o.received_at,
           o.severity::float8 AS severity, o.event_status, o.title,
           o.confidence::float8 AS confidence, o.source_quality::float8 AS source_quality,
           o.properties, o.license_class, o.attribution
    FROM observations o
    WHERE ${clauses.join(' AND ')}
    ORDER BY o.observed_at ASC, o.source_revision_at ASC NULLS FIRST, o.received_at ASC
    LIMIT ${limitParam}
  `, params);
  return result.rows;
}

function diffState(alias: string): string {
  return `CASE WHEN ${alias}.id IS NULL THEN NULL ELSE jsonb_build_object(
    'id', ${alias}.id,
    'entity_type', ${alias}.entity_type,
    'geometry', ST_AsGeoJSON(${alias}.geom)::jsonb,
    'altitude_m', ${alias}.altitude_m,
    'observed_at', ${alias}.observed_at,
    'source_revision_at', ${alias}.source_revision_at,
    'received_at', ${alias}.received_at,
    'severity', ${alias}.severity,
    'event_status', ${alias}.event_status,
    'title', ${alias}.title,
    'confidence', ${alias}.confidence,
    'source_quality', ${alias}.source_quality,
    'properties', ${alias}.properties,
    'license_class', ${alias}.license_class,
    'attribution', ${alias}.attribution
  ) END`;
}

export async function queryTimeMachineDiff(input: DiffInput, profile: string) {
  const params: unknown[] = [profile, input.from, input.to];
  const fromFilters = filterClauses('f', input, params);
  const toFilters = filterClauses('t', input, params);
  const limitParam = addParam(params, input.limit);
  const result = await db.query(`
    WITH from_latest AS (
      SELECT DISTINCT ON (o.source_id, o.source_object_id)
        ${LATEST_COLUMNS}
      FROM observations o
      WHERE o.ingest_profile = $1
        AND o.observed_at <= $2::timestamptz
        AND (o.source_revision_at IS NULL OR o.source_revision_at <= $2::timestamptz)
      ORDER BY o.source_id, o.source_object_id, o.observed_at DESC, o.source_revision_at DESC NULLS LAST, o.received_at DESC
    ), to_latest AS (
      SELECT DISTINCT ON (o.source_id, o.source_object_id)
        ${LATEST_COLUMNS}
      FROM observations o
      WHERE o.ingest_profile = $1
        AND o.observed_at <= $3::timestamptz
        AND (o.source_revision_at IS NULL OR o.source_revision_at <= $3::timestamptz)
      ORDER BY o.source_id, o.source_object_id, o.observed_at DESC, o.source_revision_at DESC NULLS LAST, o.received_at DESC
    ), from_filtered AS (
      SELECT * FROM from_latest f ${fromFilters.length ? `WHERE ${fromFilters.join(' AND ')}` : ''}
    ), to_filtered AS (
      SELECT * FROM to_latest t ${toFilters.length ? `WHERE ${toFilters.join(' AND ')}` : ''}
    )
    SELECT COALESCE(t.source_id, f.source_id) AS source_id,
           COALESCE(t.source_object_id, f.source_object_id) AS source_object_id,
           CASE WHEN f.id IS NULL THEN 'entered'
                WHEN t.id IS NULL THEN 'exited'
                ELSE 'changed' END AS change_type,
           ${diffState('f')} AS from_state,
           ${diffState('t')} AS to_state,
           GREATEST(COALESCE(f.severity, -1), COALESCE(t.severity, -1))::float8 AS sort_severity
    FROM from_filtered f
    FULL OUTER JOIN to_filtered t
      ON t.source_id = f.source_id AND t.source_object_id = f.source_object_id
    WHERE f.id IS NULL OR t.id IS NULL OR f.id <> t.id
    ORDER BY sort_severity DESC, source_id ASC, source_object_id ASC
    LIMIT ${limitParam}
  `, params);
  return result.rows;
}
