export interface TimeMachineCursorFilters {
  bbox?: [number, number, number, number];
  eventTypes?: string[];
  minSeverity?: number;
}

export interface TimeMachineCursor {
  v: 1;
  at: string;
  readCutoff: string;
  filterKey: string;
  severity: number;
  observedAt: string;
  sourceId: string;
  sourceObjectId: string;
}

export function timeMachineFilterKey(filters: TimeMachineCursorFilters): string {
  const normalized = {
    bbox: filters.bbox ?? null,
    eventTypes: [...new Set(filters.eventTypes ?? [])].sort(),
    minSeverity: filters.minSeverity ?? null,
  };
  return JSON.stringify(normalized);
}

export function encodeTimeMachineCursor(cursor: TimeMachineCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeTimeMachineCursor(value: string): TimeMachineCursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Partial<TimeMachineCursor>;
    if (parsed.v !== 1) return null;
    if (typeof parsed.at !== 'string' || !Number.isFinite(Date.parse(parsed.at))) return null;
    if (typeof parsed.readCutoff !== 'string' || !Number.isFinite(Date.parse(parsed.readCutoff))) return null;
    if (typeof parsed.filterKey !== 'string' || parsed.filterKey.length < 1 || parsed.filterKey.length > 2048) return null;
    if (typeof parsed.observedAt !== 'string' || !Number.isFinite(Date.parse(parsed.observedAt))) return null;
    if (typeof parsed.severity !== 'number' || !Number.isFinite(parsed.severity) || parsed.severity < -1 || parsed.severity > 100) return null;
    if (typeof parsed.sourceId !== 'string' || parsed.sourceId.length < 1 || parsed.sourceId.length > 64) return null;
    if (typeof parsed.sourceObjectId !== 'string' || parsed.sourceObjectId.length < 1 || parsed.sourceObjectId.length > 256) return null;
    return {
      v: 1,
      at: new Date(parsed.at).toISOString(),
      readCutoff: new Date(parsed.readCutoff).toISOString(),
      filterKey: parsed.filterKey,
      severity: parsed.severity,
      observedAt: new Date(parsed.observedAt).toISOString(),
      sourceId: parsed.sourceId,
      sourceObjectId: parsed.sourceObjectId,
    };
  } catch {
    return null;
  }
}
