import { Worker } from 'bullmq';
import { config } from './config.js';
import { redis } from './redis.js';
import { ingestMany } from './services/ingest.js';
import { usgsAdapter } from './sources/usgs.js';
import { eonetAdapter } from './sources/eonet.js';
import type { SourceAdapter } from './sources/sourceAdapter.js';
import { assertPersistentFetchAllowed } from './services/sourcePolicy.js';

const adapters = new Map<string, SourceAdapter>([
  ['usgs', usgsAdapter],
  ['nasa_eonet', eonetAdapter],
]);

const worker = new Worker('source-ingest', async (job) => {
  if (job.data.sourceId === 'usgs' && !config.usgsEnabled) return { skipped: true };
  if (job.data.sourceId === 'nasa_eonet' && !config.eonetEnabled) return { skipped: true };
  const adapter = adapters.get(job.data.sourceId);
  if (!adapter) throw new Error(`unknown adapter ${job.data.sourceId}`);
  await assertPersistentFetchAllowed(job.data.sourceId);
  const observations = await adapter.fetch();
  return ingestMany(observations);
}, {
  connection: redis,
  concurrency: 2,
});

worker.on('completed', (job, result) => console.log('ingest completed', job.id, result));
worker.on('failed', (job, error) => console.error('ingest failed', job?.id, error));

async function shutdown(signal: string) {
  console.log(`worker shutdown: ${signal}`);
  await worker.close();
  await redis.quit();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
