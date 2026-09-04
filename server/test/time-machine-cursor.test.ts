import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeTimeMachineCursor, encodeTimeMachineCursor } from '../src/domain/timeMachineCursor.js';

test('Time Machine cursor round-trips and normalizes timestamps', () => {
  const encoded = encodeTimeMachineCursor({
    v: 1,
    at: '2026-08-31T05:00:00.000Z',
    severity: 75,
    observedAt: '2026-08-31T02:00:00.000Z',
    sourceId: 'usgs',
    sourceObjectId: 'abc',
  });
  const decoded = decodeTimeMachineCursor(encoded);
  assert.deepEqual(decoded, {
    v: 1,
    at: '2026-08-31T05:00:00.000Z',
    severity: 75,
    observedAt: '2026-08-31T02:00:00.000Z',
    sourceId: 'usgs',
    sourceObjectId: 'abc',
  });
});

test('Time Machine cursor rejects malformed input', () => {
  assert.equal(decodeTimeMachineCursor('not-a-valid-cursor'), null);
  const bad = Buffer.from(JSON.stringify({ v: 1, at: 'bad' }), 'utf8').toString('base64url');
  assert.equal(decodeTimeMachineCursor(bad), null);
});
