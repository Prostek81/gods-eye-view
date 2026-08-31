import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../db.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const dir = resolve(here, '../../../db/migrations');
const files = (await readdir(dir)).filter(f => f.endsWith('.sql')).sort();
for (const file of files) {
  const sql = await readFile(resolve(dir, file), 'utf8');
  console.log(`applying ${file}`);
  await db.query(sql);
}
await db.end();
console.log('migrations complete');
