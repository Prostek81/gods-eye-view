import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { decodeTimeMachineCursor, encodeTimeMachineCursor, timeMachineFilterKey } from '../domain/timeMachineCursor.js';
import {
  queryTimeMachineCoverage,
  queryTimeMachineDiff,
  queryTimeMachineHistory,
  queryTimeMachineReadCutoff,
  queryTimeMachineSnapshot,
} from '../repositories/timeMachine.js';
import {
  finiteNumber,
  httpError,
  optionalIsoTimestamp,
  requireBbox,
  requireIsoTimestamp,
  requireSourceId,
  requireSourceObjectId,
} from '../validation.js';

function parseTypes(value: string | undefined): string[] | undefined {
  const values = value?.split(',').map(v => v.trim()).filter(Boolean).slice(0, 50);
  if (!values?.length) return undefined;
  return [...new Set(values)].sort();
}

function parseFilters(q: Record<string, string | undefined>) {
  const bbox = q.bbox ? requireBbox(q.bbox) : undefined;
  const eventTypes = parseTypes(q.types);
  const minSeverity = q.minSeverity == null ? undefined : finiteNumber(q.minSeverity, 'minSeverity', 0, 100);
  return {
    ...(bbox ? { bbox } : {}),
    ...(eventTypes ? { eventTypes } : {}),
    ...(minSeverity != null ? { minSeverity } : {}),
  };
}

export async function timeMachineRoutes(app: FastifyInstance) {
  app.get('/api/v1/time-machine', async (request) => {
    const q = request.query as Record<string, string | undefined>;
    if (!q.at) throw httpError(400, 'at is required');
    const at = requireIsoTimestamp(q.at, 'at');
    const limit = q.limit == null ? 1000 : Math.trunc(finiteNumber(q.limit, 'limit', 1, 5000));
    const filters = parseFilters(q);
    const filterKey = timeMachineFilterKey(filters);
    const decodedCursor = q.cursor ? decodeTimeMachineCursor(q.cursor) : undefined;
    if (q.cursor && !decodedCursor) throw httpError(400, 'cursor is invalid');
    if (decodedCursor && decodedCursor.at !== at) throw httpError(400, 'cursor does not belong to this at timestamp');
    if (decodedCursor && decodedCursor.filterKey !== filterKey) throw httpError(400, 'cursor does not belong to these filters');
    const readCutoff = decodedCursor?.readCutoff ?? await queryTimeMachineReadCutoff();

    const result = await queryTimeMachineSnapshot({
      at,
      readCutoff,
      limit,
      ...filters,
      ...(decodedCursor ? { cursor: decodedCursor } : {}),
    }, config.dataProfile);

    const last = result.rows.at(-1);
    const nextCursor = result.hasMore && last ? encodeTimeMachineCursor({
      v: 1,
      at,
      readCutoff,
      filterKey,
      severity: last.severity == null ? -1 : Number(last.severity),
      observedAt: new Date(last.observed_at as string | Date).toISOString(),
      sourceId: String(last.source_id),
      sourceObjectId: String(last.source_object_id),
    }) : null;

    return {
      basis: 'observed_at',
      revision_visibility: 'source_revision_at<=at',
      pagination_consistency: 'received_at<=read_cutoff',
      cursor_binding: 'at+normalized_filters+read_cutoff',
      filter_stage: 'after_latest_state_selection',
      at,
      read_cutoff: readCutoff,
      items: result.rows,
      count: result.rows.length,
      page: { has_more: result.hasMore, next_cursor: nextCursor },
    };
  });

  app.get('/api/v1/time-machine/coverage', async (request) => {
    const q = request.query as Record<string, string | undefined>;
    const coverage = await queryTimeMachineCoverage(parseFilters(q), config.dataProfile);
    return { data_profile: config.dataProfile, basis: 'observed_at', ...coverage };
  });

  app.get('/api/v1/time-machine/history', async (request) => {
    const q = request.query as Record<string, string | undefined>;
    const sourceId = requireSourceId(q.sourceId, 'sourceId');
    const sourceObjectId = requireSourceObjectId(q.sourceObjectId, 'sourceObjectId');
    const from = optionalIsoTimestamp(q.from, 'from');
    const to = optionalIsoTimestamp(q.to, 'to');
    const asOf = optionalIsoTimestamp(q.asOf, 'asOf');
    if (from && to && Date.parse(from) > Date.parse(to)) throw httpError(400, 'from must be before or equal to to');
    const limit = q.limit == null ? 1000 : Math.trunc(finiteNumber(q.limit, 'limit', 1, 5000));
    const items = await queryTimeMachineHistory({
      sourceId,
      sourceObjectId,
      limit,
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(asOf ? { asOf } : {}),
    }, config.dataProfile);
    return {
      basis: 'observed_at',
      revision_visibility: asOf ? 'source_revision_at<=asOf' : 'all_known_revisions',
      source_id: sourceId,
      source_object_id: sourceObjectId,
      from: from ?? null,
      to: to ?? null,
      as_of: asOf ?? null,
      items,
      count: items.length,
    };
  });

  app.get('/api/v1/time-machine/diff', async (request) => {
    const q = request.query as Record<string, string | undefined>;
    if (!q.from || !q.to) throw httpError(400, 'from and to are required');
    const from = requireIsoTimestamp(q.from, 'from');
    const to = requireIsoTimestamp(q.to, 'to');
    if (Date.parse(from) >= Date.parse(to)) throw httpError(400, 'from must be before to');
    const limit = q.limit == null ? 1000 : Math.trunc(finiteNumber(q.limit, 'limit', 1, 5000));
    const items = await queryTimeMachineDiff({ from, to, limit, ...parseFilters(q) }, config.dataProfile);
    return {
      basis: 'observed_at',
      revision_visibility: 'source_revision_at<=snapshot_time',
      filter_stage: 'after_latest_state_selection',
      from,
      to,
      items,
      count: items.length,
    };
  });
}
