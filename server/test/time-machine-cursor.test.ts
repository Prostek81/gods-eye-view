import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeTimeMachineCursor, encodeTimeMachineCursor, timeMachineFilterKey } from '../src/domain/timeMachineCursor.js';

test('Time Machine filter key normalizes equivalent type sets', () => {
  const a = timeMachineFilterKey({
    bbox: [10, 50, 20, 60],
    eventTypes: ['wildfire', 'earthquake', 'earthquake'],
    minSeverity: 25,
  });
  const b = timeMachineFilterKey({
    bbox: [10, 50, 20, 60],
    eventTypes: ['earthquake', 'wildfire'],
    minSeverity: 25,
  });
  assert.equal(a, b);
  assert.notEqual(a, timeMachineFilterKey({ bbox: [10, 50, 20, 60], eventTypes: ['earthquake'], minSeverity: 25 }));
});

test('Time Machine cursor round-trips and normalizes timestamps', () => {
  const filterKey = timeMachineFilterKey({ eventTypes: ['earthquake'], minSeverity: 10 });
  const encoded = encodeTimeMachineCursor({
    v: 1,
    at: '2026-08-31T05:00:00.000Z',
    readCutoff: '2026-09-04T07:00:00.000Z',
    filterKey,
    severity: 75,
    observedAt: '2026-08-31T02:00:00.000Z',
    sourceId: 'usgs',
    sourceObjectId: 'abc',
  });
  const decoded = decodeTimeMachineCursor(encoded);
  assert.deepEqual(decoded, {
    v: 1,
    at: '2026-08-31T05:00:00.000Z',
    readCutoff: '2026-09-04T07:00:00.000Z',
    filterKey,
    severity: 75,
    observedAt: '2026-08-31T02:00:00.000Z',
    sourceId: 'usgs',
    sourceObjectId: 'abc',
  });
});

test('Time Machine cursor rejects malformed or pre-filter-binding input', () => {
  assert.equal(decodeTimeMachineCursor('not-a-valid-cursor'), null);
  const bad = Buffer.from(JSON.stringify({ v: 1, at: 'bad' }), 'utf8').toString('base64url');
  assert.equal(decodeTimeMachineCursor(bad), null);
  const missingFilterKey = Buffer.from(JSON.stringify({
    v: 1,
    at: '2026-08-31T05:00:00.000Z',
    readCutoff: '2026-09-04T07:00:00.000Z',
    severity: 75,
    observedAt: '2026-08-31T02:00:00.000Z',
    sourceId: 'usgs',
    sourceObjectId: 'abc',
  }), 'utf8').toString('base64url');
  assert.equal(decodeTimeMachineCursor(missingFilterKey), null);
});
