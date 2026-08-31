import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../../src/db.js';
import { ingestObservation } from '../../src/services/ingest.js';
import { fingerprintSourcePayload } from '../../src/sources/sourceFingerprint.js';

const sourceObjectId = `ci-eq-${Date.now()}`;
const observedAt = '2026-08-31T01:00:00.000Z';

before(async () => {
  await db.query('DELETE FROM events WHERE event_key = $1', [`usgs:${sourceObjectId}`]);
  await db.query('DELETE FROM observations WHERE source_id=$1 AND source_object_id=$2', ['usgs', sourceObjectId]);
});

after(async () => { await db.end(); });

test('ingest is idempotent and preserves source provenance', async () => {
  const payload = { id: sourceObjectId, mag: 5.2, rev: 1 };
  const obs = {
    sourceId: 'usgs', sourceObjectId, entityType: 'earthquake',
    geometry: { type: 'Point' as const, coordinates: [10, 60] as [number, number] },
    observedAt, sourceRevisionAt: '2026-08-31T01:01:00.000Z',
    confidence: .98, sourceQuality: .98, severity: 65, eventStatus: 'open' as const,
    eventTitle: 'CI earthquake', properties: { mag: 5.2 }, rawPayloadHash: fingerprintSourcePayload(payload),
  };
  const first = await ingestObservation(obs);
  const second = await ingestObservation(obs);
  assert.equal(first.observationId, second.observationId);
  assert.equal(first.inserted, true);
  assert.equal(second.inserted, false);
  const row = await db.query(`SELECT license_class, attribution, ingest_profile FROM observations WHERE id=$1`, [first.observationId]);
  assert.equal(row.rows[0].license_class, 'public_domain');
  assert.match(row.rows[0].attribution, /Geological Survey/i);
  assert.equal(row.rows[0].ingest_profile, 'commercial_clean');
});

test('older observation cannot regress current event state', async () => {
  const newer = {
    sourceId: 'usgs', sourceObjectId, entityType: 'earthquake',
    geometry: { type: 'Point' as const, coordinates: [11, 61] as [number, number] },
    observedAt: '2026-08-31T02:00:00.000Z', sourceRevisionAt: '2026-08-31T02:01:00.000Z',
    confidence: .99, severity: 80, eventStatus: 'open' as const, eventTitle: 'New state', properties: { rev: 2 },
    rawPayloadHash: fingerprintSourcePayload({ id: sourceObjectId, rev: 2 }),
  };
  const olderLate = {
    ...newer,
    geometry: { type: 'Point' as const, coordinates: [9, 59] as [number, number] },
    observedAt: '2026-08-31T00:30:00.000Z', sourceRevisionAt: '2026-08-31T03:00:00.000Z',
    severity: 10, eventTitle: 'Old state', properties: { rev: 'older-late' },
    rawPayloadHash: fingerprintSourcePayload({ id: sourceObjectId, rev: 'older-late' }),
  };
  await ingestObservation(newer);
  await ingestObservation(olderLate);
  const row = await db.query(`SELECT title, severity, current_observed_at FROM events WHERE event_key=$1 AND ingest_profile='commercial_clean'`, [`usgs:${sourceObjectId}`]);
  assert.equal(row.rows[0].title, 'New state');
  assert.equal(Number(row.rows[0].severity), 80);
  assert.equal(new Date(row.rows[0].current_observed_at).toISOString(), newer.observedAt);
});

test('time-machine revision visibility prevents future knowledge', async () => {
  const closed = {
    sourceId: 'usgs', sourceObjectId, entityType: 'earthquake',
    geometry: { type: 'Point' as const, coordinates: [11, 61] as [number, number] },
    observedAt: '2026-08-31T02:00:00.000Z', sourceRevisionAt: '2026-08-31T04:00:00.000Z',
    confidence: .99, severity: 75, eventStatus: 'closed' as const, eventTitle: 'Closed later', properties: { rev: 3 },
    rawPayloadHash: fingerprintSourcePayload({ id: sourceObjectId, rev: 3 }),
  };
  await ingestObservation(closed);
  const beforeRevision = await db.query(`
    SELECT event_status FROM observations
    WHERE ingest_profile='commercial_clean' AND source_id='usgs' AND source_object_id=$1
      AND observed_at <= $2::timestamptz
      AND (source_revision_at IS NULL OR source_revision_at <= $2::timestamptz)
    ORDER BY observed_at DESC, source_revision_at DESC NULLS LAST LIMIT 1
  `, [sourceObjectId, '2026-08-31T03:00:00.000Z']);
  assert.equal(beforeRevision.rows[0].event_status, 'open');
  const afterRevision = await db.query(`
    SELECT event_status FROM observations
    WHERE ingest_profile='commercial_clean' AND source_id='usgs' AND source_object_id=$1
      AND observed_at <= $2::timestamptz
      AND (source_revision_at IS NULL OR source_revision_at <= $2::timestamptz)
    ORDER BY observed_at DESC, source_revision_at DESC NULLS LAST LIMIT 1
  `, [sourceObjectId, '2026-08-31T05:00:00.000Z']);
  assert.equal(afterRevision.rows[0].event_status, 'closed');
});
