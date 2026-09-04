import type { GeoJsonGeometry, NormalizedObservation } from './domain/types.js';

export function httpError(statusCode: number, message: string): Error & { statusCode: number } {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
}

export function requireUuid(value: unknown, field = 'id'): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw httpError(400, `${field} must be a UUID`);
  }
  return value;
}

export function requireSourceId(value: unknown, field = 'sourceId'): string {
  if (typeof value !== 'string' || !/^[a-z0-9_.-]{1,64}$/i.test(value)) throw httpError(400, `${field} is invalid`);
  return value;
}

export function requireSourceObjectId(value: unknown, field = 'sourceObjectId'): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 256) throw httpError(400, `${field} is invalid`);
  return value;
}

export function requireIsoTimestamp(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim() || !Number.isFinite(Date.parse(value))) {
    throw httpError(400, `${field} must be an ISO timestamp`);
  }
  return new Date(value).toISOString();
}

export function optionalIsoTimestamp(value: unknown, field: string): string | undefined {
  if (value == null || value === '') return undefined;
  return requireIsoTimestamp(value, field);
}

export function requireSha256(value: unknown, field = 'rawPayloadHash'): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/i.test(value)) {
    throw httpError(400, `${field} must be a 64-character SHA-256 hex digest`);
  }
  return value.toLowerCase();
}

export function finiteNumber(value: unknown, field: string, min?: number, max?: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) throw httpError(400, `${field} must be finite`);
  if (min != null && n < min) throw httpError(400, `${field} must be >= ${min}`);
  if (max != null && n > max) throw httpError(400, `${field} must be <= ${max}`);
  return n;
}

function validatePosition(value: unknown, counter: { n: number }): void {
  if (!Array.isArray(value) || (value.length !== 2 && value.length !== 3)) throw httpError(400, 'invalid GeoJSON position');
  const lon = Number(value[0]);
  const lat = Number(value[1]);
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) throw httpError(400, 'longitude out of range');
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw httpError(400, 'latitude out of range');
  if (value.length === 3 && !Number.isFinite(Number(value[2]))) throw httpError(400, 'altitude must be finite');
  counter.n += 1;
  if (counter.n > 10_000) throw httpError(413, 'geometry has too many coordinates');
}

function walkCoordinates(value: unknown, depth: number, counter: { n: number }): void {
  if (depth === 0) return validatePosition(value, counter);
  if (!Array.isArray(value) || value.length === 0) throw httpError(400, 'invalid GeoJSON coordinates');
  for (const child of value) walkCoordinates(child, depth - 1, counter);
}

export function requireGeometry(value: unknown): GeoJsonGeometry {
  if (!value || typeof value !== 'object') throw httpError(400, 'geometry is required');
  const candidate = value as { type?: unknown; coordinates?: unknown };
  const depths: Record<string, number> = {
    Point: 0,
    MultiPoint: 1,
    LineString: 1,
    MultiLineString: 2,
    Polygon: 2,
    MultiPolygon: 3,
  };
  if (typeof candidate.type !== 'string' || !(candidate.type in depths)) throw httpError(400, 'unsupported GeoJSON geometry type');
  const counter = { n: 0 };
  walkCoordinates(candidate.coordinates, depths[candidate.type]!, counter);
  return candidate as GeoJsonGeometry;
}

export function requireBbox(value: unknown, field = 'bbox'): [number, number, number, number] {
  const parts = typeof value === 'string' ? value.split(',') : value;
  if (!Array.isArray(parts) || parts.length !== 4) throw httpError(400, `${field} must have four coordinates`);
  const coordinates = parts.map(Number) as [number, number, number, number];
  const [minLon, minLat, maxLon, maxLat] = coordinates;
  if (!coordinates.every(Number.isFinite)) throw httpError(400, `${field} must contain finite numbers`);
  if (minLon < -180 || maxLon > 180 || minLat < -90 || maxLat > 90 || minLon > maxLon || minLat > maxLat) {
    throw httpError(400, `${field} is outside valid lon/lat bounds`);
  }
  return coordinates;
}

export function validateObservation(input: unknown): NormalizedObservation {
  if (!input || typeof input !== 'object') throw httpError(400, 'invalid_observation');
  const body = input as Partial<NormalizedObservation>;
  const sourceId = requireSourceId(body.sourceId, 'sourceId');
  const sourceObjectId = requireSourceObjectId(body.sourceObjectId, 'sourceObjectId');
  if (typeof body.entityType !== 'string' || !/^[a-z0-9_.-]{1,64}$/i.test(body.entityType)) throw httpError(400, 'entityType is invalid');
  const observedAt = requireIsoTimestamp(body.observedAt, 'observedAt');
  const sourceRevisionAt = optionalIsoTimestamp(body.sourceRevisionAt, 'sourceRevisionAt');
  const confidence = finiteNumber(body.confidence, 'confidence', 0, 1);
  const sourceQuality = body.sourceQuality == null ? undefined : finiteNumber(body.sourceQuality, 'sourceQuality', 0, 1);
  const severity = body.severity == null ? undefined : finiteNumber(body.severity, 'severity', 0, 100);
  const eventStatus = body.eventStatus ?? 'unknown';
  const eventClosedAt = optionalIsoTimestamp(body.eventClosedAt, 'eventClosedAt');
  if (!['open', 'closed', 'unknown'].includes(eventStatus)) throw httpError(400, 'eventStatus is invalid');
  if (body.eventTitle != null && (typeof body.eventTitle !== 'string' || body.eventTitle.length > 500)) throw httpError(400, 'eventTitle is invalid');
  if (!body.properties || typeof body.properties !== 'object' || Array.isArray(body.properties)) throw httpError(400, 'properties must be an object');
  return {
    sourceId,
    sourceObjectId,
    entityType: body.entityType,
    geometry: requireGeometry(body.geometry),
    altitudeM: body.altitudeM == null ? undefined : finiteNumber(body.altitudeM, 'altitudeM'),
    observedAt,
    sourceRevisionAt,
    confidence,
    sourceQuality,
    properties: body.properties as Record<string, unknown>,
    rawPayloadHash: requireSha256(body.rawPayloadHash),
    severity,
    eventStatus,
    eventTitle: body.eventTitle,
    eventClosedAt,
  };
}
