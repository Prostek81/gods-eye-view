import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTimeMachineFilters, resolveTimeMachineApiBase, TimeMachineApi } from './api.js';

test('Time Machine filters normalize type order and duplicates', () => {
  assert.deepEqual(normalizeTimeMachineFilters({
    types: 'wildfire,earthquake,wildfire',
    bbox: ['10', '20', '30', '40'],
    minSeverity: 120,
  }), {
    bbox: [10, 20, 30, 40],
    eventTypes: ['earthquake', 'wildfire'],
    minSeverity: 100,
  });
});

test('Time Machine API base defaults only on loopback', () => {
  assert.equal(resolveTimeMachineApiBase(undefined, { hostname: 'localhost', protocol: 'http:' }), 'http://localhost:8787');
  assert.equal(resolveTimeMachineApiBase(undefined, { hostname: 'example.com', protocol: 'https:' }), null);
  assert.equal(resolveTimeMachineApiBase('/wi/', { hostname: 'example.com', protocol: 'https:' }), '/wi');
});

test('snapshot pagination preserves normalized filters and cursor', async () => {
  const calls = [];
  const pages = [
    { items: [{ id: 1 }], read_cutoff: '2026-09-04T08:00:00.000Z', page: { has_more: true, next_cursor: 'cursor-1' } },
    { items: [{ id: 2 }], page: { has_more: false, next_cursor: null } },
  ];
  const api = new TimeMachineApi({
    baseUrl: 'http://localhost:8787',
    pageLimit: 1,
    fetchImpl: async (url) => {
      calls.push(String(url));
      const body = pages.shift();
      return { ok: true, status: 200, async json() { return body; } };
    },
  });
  const result = await api.snapshot('2026-09-04T07:00:00.000Z', { types: ['wildfire', 'earthquake', 'wildfire'], minSeverity: 20 });
  assert.equal(result.items.length, 2);
  assert.equal(result.pages, 2);
  assert.match(calls[0], /types=earthquake%2Cwildfire/);
  assert.match(calls[1], /types=earthquake%2Cwildfire/);
  assert.match(calls[1], /cursor=cursor-1/);
});
