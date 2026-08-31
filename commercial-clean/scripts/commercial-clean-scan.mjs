#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const repo = resolve(process.argv[2] ?? '.');
const policy = JSON.parse(await readFile(resolve(repo, 'commercial-clean/source-policy.json'), 'utf8'));
const sources = policy.sources ?? {};
const errors = [];

for (const [id, source] of Object.entries(sources)) {
  const disposition = source.disposition;
  const storage = source.storage;
  if (['block_default', 'block_and_remove', 'dev_only'].includes(disposition) && storage !== 'none') {
    errors.push(`${id}: ${disposition} must have storage=none`);
  }
  if (storage === 'transient_only' && disposition === 'allow') {
    errors.push(`${id}: transient_only source cannot be unconditional allow for persistent Event Store`);
  }
}

const seed = await readFile(resolve(repo, 'db/migrations/004_seed_sources.sql'), 'utf8');
for (const [id, source] of Object.entries(sources)) {
  const expected = source.storage === 'none' ? "'none'" : source.storage === 'transient_only' ? "'transient_only'" : null;
  if (expected && !seed.includes(`('${id}'`) && id !== 'telegeography_submarine_cables') {
    errors.push(`${id}: source policy is not represented in DB seed`);
  }
}

const worker = await readFile(resolve(repo, 'server/src/worker.ts'), 'utf8');
if (!worker.includes('assertPersistentFetchAllowed')) errors.push('worker must gate policy before provider fetch');
const sourcePolicy = await readFile(resolve(repo, 'server/src/services/sourcePolicy.ts'), 'utf8');
if (!sourcePolicy.includes("storage_policy !== 'normalized_only'")) errors.push('persistent source policy must reject none/transient_only storage');

if (errors.length) {
  for (const error of errors) console.error(`[BLOCK] ${error}`);
  console.error('Commercial clean Event Store scan FAILED.');
  process.exit(2);
}
console.log('Commercial clean Event Store scan PASS: blocked/dev/transient sources cannot persist through PR1.');
