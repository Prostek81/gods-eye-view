export type GeoJsonGeometry =
  | { type: 'Point'; coordinates: [number, number] | [number, number, number] }
  | { type: 'MultiPoint'; coordinates: number[][] }
  | { type: 'LineString'; coordinates: number[][] }
  | { type: 'MultiLineString'; coordinates: number[][][] }
  | { type: 'Polygon'; coordinates: number[][][] }
  | { type: 'MultiPolygon'; coordinates: number[][][][] };

export type DataProfile = 'commercial_clean' | 'development';

export interface NormalizedObservation {
  sourceId: string;
  sourceObjectId: string;
  entityType: string;
  geometry: GeoJsonGeometry;
  altitudeM?: number | undefined;
  observedAt: string;
  sourceRevisionAt?: string | undefined;
  confidence: number;
  sourceQuality?: number | undefined;
  properties: Record<string, unknown>;
  rawPayloadHash: string;
  severity?: number | undefined;
  eventStatus?: 'open' | 'closed' | 'unknown' | undefined;
  eventTitle?: string | undefined;
  eventClosedAt?: string | undefined;
}

export interface EventQuery {
  at?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  bbox?: [number, number, number, number] | undefined;
  eventTypes?: string[] | undefined;
  minSeverity?: number | undefined;
  limit: number;
}

export interface SourceContext {
  sourceId: string;
  licenseClass: string;
  attribution: string;
  ingestProfile: DataProfile;
}
