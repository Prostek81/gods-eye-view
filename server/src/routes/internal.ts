import type { FastifyInstance } from 'fastify';
import { assertInternal } from '../security.js';
import { ingestObservation } from '../services/ingest.js';
import { recomputeRisk } from '../services/riskService.js';
import { config } from '../config.js';
import { finiteNumber, validateObservation } from '../validation.js';

export async function internalRoutes(app: FastifyInstance) {
  app.post('/internal/v1/observations', async (request) => {
    assertInternal(request);
    return ingestObservation(validateObservation(request.body));
  });

  app.post('/internal/v1/risk/recompute', async (request) => {
    assertInternal(request);
    const body = (request.body ?? {}) as { radiusKm?: unknown };
    const radiusKm = body.radiusKm == null
      ? config.riskDefaultRadiusKm
      : finiteNumber(body.radiusKm, 'radiusKm', 1, 5000);
    return recomputeRisk(radiusKm);
  });
}
