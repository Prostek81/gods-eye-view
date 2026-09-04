import Fastify from 'fastify';
import { config } from './config.js';
import { db } from './db.js';
import { eventsRoutes } from './routes/events.js';
import { timelineRoutes } from './routes/timeline.js';
import { timeMachineRoutes } from './routes/timeMachine.js';
import { assetsRoutes } from './routes/assets.js';
import { anomalyRoutes } from './routes/anomalies.js';
import { internalRoutes } from './routes/internal.js';
import { watchlistRoutes } from './routes/watchlists.js';
import { assertInternal, requiresGatewayAuth } from './security.js';

const app = Fastify({
  logger: { level: config.logLevel },
  trustProxy: true,
  bodyLimit: 1_000_000,
});

app.addHook('onRequest', async (request, reply) => {
  const origin = request.headers.origin;
  if (origin && config.corsOrigins.has(origin)) {
    reply.header('access-control-allow-origin', origin);
    reply.header('vary', 'Origin');
  }
  reply.header('x-content-type-options', 'nosniff');
  reply.header('referrer-policy', 'no-referrer');
  reply.header('x-frame-options', 'DENY');
  reply.header('cache-control', 'no-store');

  if (requiresGatewayAuth() && request.method !== 'OPTIONS' && request.url !== '/health') {
    assertInternal(request);
  }
});

app.options('/*', async (_request, reply) => reply
  .header('access-control-allow-methods', 'GET,POST,OPTIONS')
  .header('access-control-allow-headers', 'content-type,x-internal-api-key')
  .code(204)
  .send());

app.get('/health', async () => {
  const result = await db.query('SELECT now() AS now, PostGIS_Version() AS postgis');
  return { status: 'ok', database: result.rows[0], service: 'world-intelligence-api', version: '0.1.0' };
});

await app.register(eventsRoutes);
await app.register(timelineRoutes);
await app.register(timeMachineRoutes);
await app.register(assetsRoutes);
await app.register(anomalyRoutes);
await app.register(watchlistRoutes);
await app.register(internalRoutes);

app.setErrorHandler((error, request, reply) => {
  request.log.error({ err: error }, 'request failed');
  const candidate = error as Error & { statusCode?: number };
  const status = Number.isInteger(candidate.statusCode) ? candidate.statusCode! : 500;
  if (status >= 500) return reply.code(status).send({ error: 'internal_error' });
  return reply.code(status).send({ error: candidate.message || 'request_error' });
});

async function shutdown(signal: string) {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  await db.end();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ host: config.host, port: config.port });
