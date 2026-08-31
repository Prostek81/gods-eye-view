import type { GeoJsonGeometry, NormalizedObservation } from '../domain/types.js';
import type { SourceAdapter } from './sourceAdapter.js';
import { fingerprintSourcePayload } from './sourceFingerprint.js';
import { fetchJsonBounded } from './boundedFetch.js';

const URL = 'https://eonet.gsfc.nasa.gov/api/v3/events?status=all&days=30&limit=250';

export type EonetEvent = {
  id: string;
  title: string;
  description?: string | null;
  closed?: string | null;
  categories?: Array<{ id: string; title: string }>;
  sources?: Array<{ id: string; url: string }>;
  geometry?: Array<{
    date: string;
    type: GeoJsonGeometry['type'];
    coordinates: unknown;
    magnitudeValue?: number | null;
    magnitudeUnit?: string | null;
  }>;
};

function categoryId(event: EonetEvent): string { return event.categories?.[0]?.id ?? 'natural_event'; }

function severity(event: EonetEvent, magnitude?: number | null): number {
  const cat = categoryId(event);
  if (typeof magnitude === 'number' && Number.isFinite(magnitude)) {
    if (cat === 'earthquakes') return Math.max(0, Math.min(100, magnitude / 8 * 100));
    return Math.max(20, Math.min(95, 35 + Math.log10(Math.abs(magnitude) + 1) * 20));
  }
  if (cat === 'severeStorms') return 65;
  if (cat === 'wildfires') return 55;
  if (cat === 'volcanoes') return 60;
  return 40;
}

export function normalizeEonetBody(body: { events: EonetEvent[] }): NormalizedObservation[] {
  const out: NormalizedObservation[] = [];
  for (const event of body.events) {
    const closedAt = event.closed ? new Date(event.closed).toISOString() : undefined;
    for (const geometry of event.geometry ?? []) {
      if (!geometry.date || !geometry.type || geometry.coordinates == null) continue;
      const geo = { type: geometry.type, coordinates: geometry.coordinates } as GeoJsonGeometry;
      out.push({
        sourceId: 'nasa_eonet',
        sourceObjectId: event.id,
        entityType: categoryId(event),
        geometry: geo,
        observedAt: new Date(geometry.date).toISOString(),
        sourceRevisionAt: closedAt,
        confidence: 0.9,
        sourceQuality: 0.9,
        severity: severity(event, geometry.magnitudeValue),
        eventStatus: closedAt ? 'closed' : 'open',
        eventClosedAt: closedAt,
        eventTitle: event.title,
        rawPayloadHash: fingerprintSourcePayload({
          id: event.id, title: event.title, description: event.description ?? null,
          closed: event.closed ?? null, categories: event.categories ?? [], sources: event.sources ?? [], geometry,
        }),
        properties: {
          description: event.description ?? null,
          categories: event.categories ?? [],
          sources: event.sources ?? [],
          magnitudeValue: geometry.magnitudeValue ?? null,
          magnitudeUnit: geometry.magnitudeUnit ?? null,
          closedAt: closedAt ?? null,
        },
      });
    }
  }
  return out;
}

export const eonetAdapter: SourceAdapter = {
  id: 'nasa_eonet',
  async fetch() { return normalizeEonetBody(await fetchJsonBounded<{ events: EonetEvent[] }>(URL)); },
};
