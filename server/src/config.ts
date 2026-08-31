import 'dotenv/config';
import type { DataProfile } from './domain/types.js';

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw == null) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

function csvSet(name: string): ReadonlySet<string> {
  return new Set((process.env[name] ?? '').split(',').map(v => v.trim()).filter(Boolean));
}

function dataProfile(): DataProfile {
  const value = process.env.DATA_PROFILE ?? 'commercial_clean';
  if (value !== 'commercial_clean' && value !== 'development') {
    throw new Error('DATA_PROFILE must be commercial_clean or development');
  }
  return value;
}

export function isLoopbackHost(host: string): boolean {
  return ['127.0.0.1', 'localhost', '::1'].includes(host);
}

const nodeEnv = process.env.NODE_ENV ?? 'development';
const host = process.env.HOST ?? '127.0.0.1';
const internalApiKey = process.env.INTERNAL_API_KEY?.trim() || undefined;
if ((nodeEnv === 'production' || !isLoopbackHost(host)) && !internalApiKey) {
  throw new Error('INTERNAL_API_KEY is required in production or when binding beyond loopback');
}

export const config = {
  nodeEnv,
  host,
  port: Number(process.env.PORT ?? 8787),
  databaseUrl: required('DATABASE_URL', 'postgres://worldintel:worldintel@localhost:5432/worldintel'),
  redisUrl: required('REDIS_URL', 'redis://localhost:6379'),
  internalApiKey,
  logLevel: process.env.LOG_LEVEL ?? 'info',
  corsOrigins: csvSet('CORS_ORIGINS'),
  dataProfile: dataProfile(),
  conditionalSources: csvSet('CONDITIONAL_SOURCES'),
  usgsEnabled: bool('USGS_ENABLED', true),
  eonetEnabled: bool('EONET_ENABLED', true),
  anomalyMinSamples: Number(process.env.ANOMALY_MIN_SAMPLES ?? 20),
  riskDefaultRadiusKm: Number(process.env.RISK_DEFAULT_RADIUS_KM ?? 500),
} as const;
