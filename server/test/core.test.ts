import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { evaluateAnomaly } from '../src/domain/anomaly.js';
import { calculateRisk } from '../src/domain/risk.js';
import { observationDedupeKey } from '../src/repositories/observations.js';
import { fingerprintSourcePayload } from '../src/sources/sourceFingerprint.js';
import { normalizeUsgsBody } from '../src/sources/usgs.js';
import { normalizeEonetBody } from '../src/sources/eonet.js';
import { fetchJsonBounded } from '../src/sources/boundedFetch.js';
import { requireBbox, requireGeometry, validateObservation } from '../src/validation.js';
import type { NormalizedObservation } from '../src/domain/types.js';

const baseline = [9,10,11,10,12,9,10,11,10,9,11,10,10,12,9,10,11,10,9,10,11,10,12,9,10,11,10,9,10,11];
const sha = 'a'.repeat(64);

test('high outlier scores higher than baseline-like value', () => {
  assert.ok(evaluateAnomaly(30, baseline).score > evaluateAnomaly(11, baseline).score);
  assert.ok(evaluateAnomaly(30, baseline).score > 80);
});

test('risk decays with distance', () => {
  const near = calculateRisk({ severity: 80, eventConfidence: .9, distanceKm: 10, impactRadiusKm: 100, assetImportance: .8 });
  const far = calculateRisk({ severity: 80, eventConfidence: .9, distanceKm: 300, impactRadiusKm: 100, assetImportance: .8 });
  assert.ok(near.score > far.score);
});

test('risk is suppressed by low confidence', () => {
  const hi = calculateRisk({ severity: 90, eventConfidence: .95, distanceKm: 10, impactRadiusKm: 100, assetImportance: 1 });
  const lo = calculateRisk({ severity: 90, eventConfidence: .2, distanceKm: 10, impactRadiusKm: 100, assetImportance: 1 });
  assert.ok(hi.score > lo.score * 4);
});

test('source fingerprint is stable across object key order', () => {
  assert.equal(fingerprintSourcePayload({ b: 2, a: 1 }), fingerprintSourcePayload({ a: 1, b: 2 }));
});

test('identical revision has identical dedupe key; changed revision/profile differs', () => {
  const base: NormalizedObservation = {
    sourceId: 'usgs', sourceObjectId: 'eq-1', entityType: 'earthquake',
    geometry: { type: 'Point', coordinates: [10, 60] }, observedAt: '2026-08-31T00:00:00.000Z',
    sourceRevisionAt: '2026-08-31T00:01:00.000Z', confidence: .98, properties: {}, rawPayloadHash: sha,
  };
  assert.equal(observationDedupeKey(base, 'commercial_clean'), observationDedupeKey({ ...base }, 'commercial_clean'));
  assert.notEqual(observationDedupeKey(base, 'commercial_clean'), observationDedupeKey({ ...base, sourceRevisionAt: '2026-08-31T00:02:00.000Z' }, 'commercial_clean'));
  assert.notEqual(observationDedupeKey(base, 'commercial_clean'), observationDedupeKey(base, 'development'));
});

test('USGS normalization preserves observed/revision times and converts depth to negative altitude', () => {
  const item = normalizeUsgsBody({ features: [{ id: 'x', properties: { mag: 4.8, time: 1_788_131_600_000, updated: 1_788_131_660_000 }, geometry: { type: 'Point', coordinates: [12, 63, 7.5] } }] })[0]!;
  assert.equal(item.geometry.type, 'Point');
  assert.equal(item.altitudeM, -7500);
  assert.ok(item.sourceRevisionAt);
  assert.match(item.rawPayloadHash, /^[0-9a-f]{64}$/);
});

test('EONET closed event carries closure as source revision so history cannot know it early', () => {
  const item = normalizeEonetBody({ events: [{ id: 'E1', title: 'Fire', closed: '2026-08-31T04:00:00Z', categories: [{ id: 'wildfires', title: 'Wildfires' }], geometry: [{ date: '2026-08-31T01:00:00Z', type: 'Point', coordinates: [10, 60] }] }] })[0]!;
  assert.equal(item.eventStatus, 'closed');
  assert.equal(item.sourceRevisionAt, '2026-08-31T04:00:00.000Z');
  assert.equal(item.eventClosedAt, '2026-08-31T04:00:00.000Z');
});

test('valid geometry accepts lon/lat point', () => {
  assert.deepEqual(requireGeometry({ type: 'Point', coordinates: [10, 60] }), { type: 'Point', coordinates: [10, 60] });
});

test('geometry rejects invalid lon/lat', () => {
  assert.throws(() => requireGeometry({ type: 'Point', coordinates: [200, 60] }));
});

test('bbox validates ordering and world bounds', () => {
  assert.deepEqual(requireBbox('-10,50,20,70'), [-10, 50, 20, 70]);
  assert.throws(() => requireBbox('20,50,-10,70'));
});

test('observation validation requires real SHA-256 and bounded confidence/severity', () => {
  const valid = { sourceId: 'usgs', sourceObjectId: 'x', entityType: 'earthquake', geometry: { type: 'Point', coordinates: [10,60] }, observedAt: '2026-08-31T00:00:00Z', confidence: .9, severity: 50, properties: {}, rawPayloadHash: sha };
  assert.equal(validateObservation(valid).confidence, .9);
  assert.throws(() => validateObservation({ ...valid, rawPayloadHash: 'aaa' }));
  assert.throws(() => validateObservation({ ...valid, confidence: 2 }));
});

test('bounded fetch rejects oversized decoded provider response', async () => {
  const server = createServer((_req, res) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ payload: 'x'.repeat(2048) })); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  try {
    if (!address || typeof address === 'string') throw new Error('server address unavailable');
    await assert.rejects(fetchJsonBounded(`http://127.0.0.1:${address.port}`, { maxBytes: 128 }));
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
