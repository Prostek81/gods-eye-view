import { Queue } from 'bullmq';
import { redis } from './redis.js';

export type IngestJob = { sourceId: 'usgs' | 'nasa_eonet' };
export const ingestQueue = new Queue<IngestJob>('source-ingest', { connection: redis });
