import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../db.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const dir = resolve(here, '../../../db/migrations');
const files = (await readdir(dir)).filter(f => f.endsWith('.sql')).sort();
const client = await db.connect();
try {
  await client.query('BEGIN');
  for (const file of files) {
    const sql = await readFile(resolve(dir, file), 'utf8');
    console.log(`dry-run ${file}`);
    await client.query(sql);
  }
  await client.query('ROLLBACK');
  console.log('migration dry-run complete: ROLLBACK');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await db.end();
}
