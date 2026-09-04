import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const cwd = process.cwd();
const root = existsSync(resolve(cwd, 'server')) ? cwd : resolve(cwd, '..');
async function text(path: string) { return readFile(resolve(root, path), 'utf8'); }

test('all mutation routes are protected by assertInternal', async () => {
  for (const file of ['server/src/routes/assets.ts','server/src/routes/watchlists.ts','server/src/routes/anomalies.ts','server/src/routes/internal.ts']) {
    const s = await text(file);
    const postCount = (s.match(/app\.post\(/g) ?? []).length;
    const guardCount = (s.match(/assertInternal\(request\)/g) ?? []).length;
    assert.equal(guardCount, postCount, `${file}: every POST requires assertInternal`);
  }
});

test('Time Machine is based on observed_at and hides future source revisions', async () => {
  const s = await text('server/src/repositories/timeMachine.ts');
  assert.match(s, /o\.observed_at <= \$2::timestamptz/);
  assert.match(s, /o\.source_revision_at IS NULL OR o\.source_revision_at <= \$2::timestamptz/);
  assert.doesNotMatch(s, /o\.received_at <= \$2::timestamptz/);
});

test('Time Machine filters are applied after latest-state selection', async () => {
  const s = await text('server/src/repositories/timeMachine.ts');
  assert.ok(s.indexOf('WITH latest AS') < s.indexOf('FROM latest s'));
  assert.match(s, /FROM latest s/);
});

test('Time Machine API exposes snapshot, coverage, history and diff', async () => {
  const s = await text('server/src/routes/timeMachine.ts');
  for (const route of [
    '/api/v1/time-machine',
    '/api/v1/time-machine/coverage',
    '/api/v1/time-machine/history',
    '/api/v1/time-machine/diff',
  ]) assert.ok(s.includes(route), `missing ${route}`);
});

test('persistent worker checks source policy before provider fetch', async () => {
  const s = await text('server/src/worker.ts');
  assert.ok(s.indexOf('assertPersistentFetchAllowed') < s.indexOf('adapter.fetch()'));
});

test('blocked/dev sources are non-persistent in source policy matrix', async () => {
  const policy = JSON.parse(await text('commercial-clean/source-policy.json'));
  for (const id of ['opensky','google_news_rss','aisstream','telegeography_submarine_cables']) assert.equal(policy.sources[id].storage, 'none');
});

test('persistent policy rejects transient_only storage', async () => {
  const s = await text('server/src/services/sourcePolicy.ts');
  assert.match(s, /storage_policy !== 'normalized_only'/);
});

test('event upsert guards current state against older observations', async () => {
  const s = await text('server/src/repositories/events.ts');
  assert.match(s, /EXCLUDED\.current_observed_at/);
  assert.match(s, /events\.current_observed_at/);
  assert.match(s, /current_source_revision_at/);
});
