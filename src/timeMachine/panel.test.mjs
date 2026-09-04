import test from 'node:test';
import assert from 'node:assert/strict';
import { isoToUtcInput, utcInputToIso, timeFromSlider, sliderFromTime } from './panel.js';

test('UTC input round-trips without applying local timezone', () => {
  const iso = '2026-09-04T08:15:30.000Z';
  assert.equal(isoToUtcInput(iso), '2026-09-04T08:15:30');
  assert.equal(utcInputToIso('2026-09-04T08:15:30'), iso);
});

test('scrubber maps coverage bounds deterministically', () => {
  const min = '2026-09-04T00:00:00.000Z';
  const max = '2026-09-04T10:00:00.000Z';
  assert.equal(timeFromSlider(500, min, max), '2026-09-04T05:00:00.000Z');
  assert.equal(sliderFromTime('2026-09-04T02:30:00.000Z', min, max), 250);
});
