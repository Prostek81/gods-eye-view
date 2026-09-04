import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../../src/db.js';
import { ingestObservation } from '../../src/services/ingest.js';
import { fingerprintSourcePayload } from '../../src/sources/sourceFingerprint.js';
import {
  queryTimeMachineCoverage,
  queryTimeMachineDiff,
  queryTimeMachineHistory,
  queryTimeMachineReadCutoff,
  queryTimeMachineSnapshot,
} from '../../src/repositories/timeMachine.js';
import { timeMachineFilterKey, type TimeMachineCursor } from '../../src/domain/timeMachineCursor.js';

const idA = `tm-a-${Date.now()}`;
const idB = `tm-b-${Date.now()}`;
const eventKeys = [`usgs:${idA}`, `usgs:${idB}`];

async function ingest(sourceObjectId: string, observedAt: string, sourceRevisionAt: string, severity: number, status: 'open'|'closed', revision: string) {
  return ingestObservation({
    sourceId: 'usgs',
    sourceObjectId,
    entityType: 'earthquake',
    geometry: { type: 'Point' as const, coordinates: sourceObjectId === idA ? [11, 61] as [number, number] : [12, 62] as [number, number] },
    observedAt,
    sourceRevisionAt,
    confidence: .99,
    sourceQuality: .99,
    severity,
    eventStatus: status,
    eventTitle: `${sourceObjectId}-${revision}`,
    properties: { revision },
    rawPayloadHash: fingerprintSourcePayload({ sourceObjectId, observedAt, sourceRevisionAt, revision }),
  });
}

before(async () => {
  await db.query('DELETE FROM events WHERE event_key = ANY($1::text[])', [eventKeys]);
  await db.query('DELETE FROM observations WHERE source_id=$1 AND source_object_id = ANY($2::text[])', ['usgs', [idA, idB]]);
  await ingest(idA, '2026-08-31T01:00:00.000Z', '2026-08-31T01:05:00.000Z', 20, 'open', 'base');
  await ingest(idA, '2026-08-31T02:00:00.000Z', '2026-08-31T02:05:00.000Z', 60, 'open', 'changed');
  await ingest(idA, '2026-08-31T02:00:00.000Z', '2026-08-31T04:00:00.000Z', 55, 'closed', 'closed-later');
  await ingest(idB, '2026-08-31T02:30:00.000Z', '2026-08-31T02:31:00.000Z', 70, 'open', 'entered');
});

after(async () => {
  await db.query('DELETE FROM events WHERE event_key = ANY($1::text[])', [eventKeys]);
  await db.query('DELETE FROM observations WHERE source_id=$1 AND source_object_id = ANY($2::text[])', ['usgs', [idA, idB]]);
  await db.end();
});

test('snapshot hides future revisions and later reveals them', async () => {
  const readCutoff = await queryTimeMachineReadCutoff();
  const beforeRevision = await queryTimeMachineSnapshot({ at: '2026-08-31T03:00:00.000Z', readCutoff, limit: 100 }, 'commercial_clean');
  const aBefore = beforeRevision.rows.find(row => row.source_object_id === idA);
  assert.equal(aBefore?.event_status, 'open');
  assert.equal(Number(aBefore?.severity), 60);

  const afterRevision = await queryTimeMachineSnapshot({ at: '2026-08-31T05:00:00.000Z', readCutoff, limit: 100 }, 'commercial_clean');
  const aAfter = afterRevision.rows.find(row => row.source_object_id === idA);
  assert.equal(aAfter?.event_status, 'closed');
  assert.equal(Number(aAfter?.severity), 55);
});

test('snapshot cursor is stable against concurrent late-arriving ingests', async () => {
  const at = '2026-08-31T05:00:00.000Z';
  const readCutoff = await queryTimeMachineReadCutoff();
  const filters = { eventTypes: ['earthquake'] };
  const first = await queryTimeMachineSnapshot({ at, readCutoff, limit: 1, ...filters }, 'commercial_clean');
  assert.equal(first.rows.length, 1);
  assert.equal(first.hasMore, true);
  const row = first.rows[0]!;
  const cursor: TimeMachineCursor = {
    v: 1,
    at,
    readCutoff,
    filterKey: timeMachineFilterKey(filters),
    severity: row.severity == null ? -1 : Number(row.severity),
    observedAt: new Date(row.observed_at as string | Date).toISOString(),
    sourceId: String(row.source_id),
    sourceObjectId: String(row.source_object_id),
  };
  await ingest(idB, '2026-08-31T04:00:00.000Z', '2026-08-31T04:01:00.000Z', 99, 'open', 'late-after-page-one');
  const second = await queryTimeMachineSnapshot({ at, readCutoff, limit: 1, cursor, ...filters }, 'commercial_clean');
  assert.equal(second.rows.length, 1);
  assert.notEqual(second.rows[0]!.source_object_id, row.source_object_id);
});

test('history asOf does not expose a later revision', async () => {
  const history = await queryTimeMachineHistory({
    sourceId: 'usgs', sourceObjectId: idA, asOf: '2026-08-31T03:00:00.000Z', limit: 100,
  }, 'commercial_clean');
  assert.equal(history.length, 2);
  assert.equal(history.at(-1)?.event_status, 'open');
});

test('diff reports changed and entered entities between snapshots', async () => {
  const diff = await queryTimeMachineDiff({
    from: '2026-08-31T01:30:00.000Z', to: '2026-08-31T03:00:00.000Z', limit: 100,
  }, 'commercial_clean');
  const changed = diff.find(row => row.source_object_id === idA);
  const entered = diff.find(row => row.source_object_id === idB);
  assert.equal(changed?.change_type, 'changed');
  assert.equal(entered?.change_type, 'entered');
});

test('coverage exposes persisted observation bounds and source counts', async () => {
  const coverage = await queryTimeMachineCoverage({ eventTypes: ['earthquake'] }, 'commercial_clean');
  assert.ok(coverage);
  assert.ok(Number(coverage.observation_count) >= 4);
  assert.ok(Number(coverage.distinct_entity_count) >= 2);
  assert.ok(Number(coverage.by_source.usgs) >= 4);
});
