import type { FastifyInstance } from 'fastify';
import { db } from '../db.js';
import { assertInternal } from '../security.js';
import { detectEventCountAnomaly } from '../services/anomalyService.js';
import { config } from '../config.js';
import { finiteNumber, requireBbox } from '../validation.js';

export async function anomalyRoutes(app: FastifyInstance) {
  app.get('/api/v1/anomalies', async (request) => {
    const q = request.query as Record<string, string | undefined>;
    const minScore = q.minScore == null ? 0 : finiteNumber(q.minScore, 'minScore', 0, 100);
    const limit = q.limit == null ? 100 : Math.trunc(finiteNumber(q.limit, 'limit', 1, 500));
    const result = await db.query(`
      SELECT * FROM anomalies
      WHERE ingest_profile = $1 AND score >= $2
      ORDER BY detected_at DESC, score DESC
      LIMIT $3
    `, [config.dataProfile, minScore, limit]);
    return { items: result.rows, count: result.rowCount ?? 0 };
  });

  app.post('/internal/v1/anomalies/event-count', async (request) => {
    assertInternal(request);
    const body = (request.body ?? {}) as { bbox?: unknown; windowMinutes?: unknown; lookbackDays?: unknown; eventType?: unknown };
    const detectorInput: Parameters<typeof detectEventCountAnomaly>[0] = {
      bbox: requireBbox(body.bbox),
    };
    if (body.windowMinutes != null) detectorInput.windowMinutes = Math.trunc(finiteNumber(body.windowMinutes, 'windowMinutes', 5, 1440));
    if (body.lookbackDays != null) detectorInput.lookbackDays = Math.trunc(finiteNumber(body.lookbackDays, 'lookbackDays', 7, 180));
    if (body.eventType != null) detectorInput.eventType = String(body.eventType).slice(0, 64);
    return detectEventCountAnomaly(detectorInput);
  });
}
