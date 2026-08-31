import type { NormalizedObservation } from '../domain/types.js';
import type { SourceAdapter } from './sourceAdapter.js';
import { fingerprintSourcePayload } from './sourceFingerprint.js';
import { fetchJsonBounded } from './boundedFetch.js';

const FEED = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson';

export type UsgsFeature = {
  id: string;
  properties: { mag?: number; place?: string; time?: number; updated?: number; url?: string; felt?: number; tsunami?: number; alert?: string | null };
  geometry: { type: 'Point'; coordinates: [number, number, number] };
};

function severityFromMagnitude(mag: number): number {
  if (!Number.isFinite(mag)) return 0;
  return Math.max(0, Math.min(100, (mag / 8) * 100));
}

export function normalizeUsgsBody(body: { features: UsgsFeature[] }): NormalizedObservation[] {
  return body.features.flatMap((feature): NormalizedObservation[] => {
    const time = feature.properties.time;
    if (!time) return [];
    const [lon, lat, depthKm] = feature.geometry.coordinates;
    const mag = Number(feature.properties.mag ?? 0);
    return [{
      sourceId: 'usgs',
      sourceObjectId: feature.id,
      entityType: 'earthquake',
      geometry: { type: 'Point', coordinates: [lon, lat] },
      altitudeM: Number.isFinite(depthKm) ? -(depthKm * 1000) : undefined,
      observedAt: new Date(time).toISOString(),
      sourceRevisionAt: feature.properties.updated ? new Date(feature.properties.updated).toISOString() : undefined,
      confidence: 0.98,
      sourceQuality: 0.98,
      severity: severityFromMagnitude(mag),
      eventStatus: 'open',
      eventTitle: feature.properties.place ? `M${mag.toFixed(1)} — ${feature.properties.place}` : `Earthquake M${mag.toFixed(1)}`,
      rawPayloadHash: fingerprintSourcePayload(feature),
      properties: {
        magnitude: mag,
        place: feature.properties.place ?? null,
        updatedAt: feature.properties.updated ? new Date(feature.properties.updated).toISOString() : null,
        url: feature.properties.url ?? null,
        felt: feature.properties.felt ?? null,
        tsunami: feature.properties.tsunami ?? 0,
        alert: feature.properties.alert ?? null,
        depthKm,
      },
    }];
  });
}

export const usgsAdapter: SourceAdapter = {
  id: 'usgs',
  async fetch() {
    return normalizeUsgsBody(await fetchJsonBounded<{ features: UsgsFeature[] }>(FEED));
  },
};
