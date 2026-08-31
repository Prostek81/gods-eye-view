import { timingSafeEqual } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { config, isLoopbackHost } from './config.js';
import { httpError } from './validation.js';

function safeEqual(a: string, b: string): boolean {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

export function assertInternal(request: FastifyRequest): void {
  const expected = config.internalApiKey;
  if (!expected) throw httpError(503, 'internal authentication is not configured');
  const supplied = request.headers['x-internal-api-key'];
  if (typeof supplied !== 'string' || !safeEqual(supplied, expected)) throw httpError(401, 'unauthorized');
}

export function requiresGatewayAuth(): boolean {
  return config.nodeEnv === 'production' || !isLoopbackHost(config.host);
}
