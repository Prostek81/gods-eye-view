#!/usr/bin/env node
import { access, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const repo = resolve(process.argv[2] ?? '.');
let failed = false;
const hardPaths = ['src/data/local_data/telegeography_submarine_cables'];
for (const rel of hardPaths) {
  try { await access(join(repo, rel)); console.error(`[BLOCK] commercial release contains ${rel}`); failed = true; } catch {}
}
const legacy = await readFile(join(repo, 'vite.config.js'), 'utf8');
for (const [name, regex] of [['OpenSky', /opensky/i], ['Google News RSS', /news\.google|google\s*news/i], ['AISStream', /aisstream/i]]) {
  if (regex.test(legacy)) console.error(`[REVIEW] legacy GEV still references ${name}; source must be migrated/gated before commercial release.`);
}
if (failed) {
  console.error('Commercial RELEASE scan FAILED as expected until legacy GEV datasets are removed/migrated.');
  process.exit(2);
}
console.log('Commercial RELEASE scan PASS.');
