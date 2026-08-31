import { ingestQueue } from '../queues.js';
import { redis } from '../redis.js';

await ingestQueue.add('usgs-bootstrap', { sourceId: 'usgs' }, { removeOnComplete: 100, removeOnFail: 100 });
await ingestQueue.add('eonet-bootstrap', { sourceId: 'nasa_eonet' }, { removeOnComplete: 100, removeOnFail: 100 });
console.log('bootstrap ingest jobs queued');
await ingestQueue.close();
await redis.quit();
