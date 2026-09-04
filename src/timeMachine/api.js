const DEFAULT_PAGE_LIMIT = 1000;
const DEFAULT_MAX_ITEMS = 20000;

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function normalizeTimeMachineFilters(input = {}) {
  const rawTypes = input.eventTypes ?? input.types ?? [];
  const typeList = Array.isArray(rawTypes) ? rawTypes : String(rawTypes).split(',');
  const eventTypes = [...new Set(typeList.map((value) => String(value).trim()).filter(Boolean))].sort();

  let bbox;
  if (Array.isArray(input.bbox) && input.bbox.length === 4) {
    const candidate = input.bbox.map(finiteNumber);
    if (candidate.every((value) => value !== null)) bbox = candidate;
  }

  const severity = input.minSeverity == null ? null : finiteNumber(input.minSeverity);
  const minSeverity = severity == null ? undefined : Math.max(0, Math.min(100, severity));

  return Object.freeze({
    ...(bbox ? { bbox: Object.freeze(bbox) } : {}),
    ...(eventTypes.length ? { eventTypes: Object.freeze(eventTypes) } : {}),
    ...(minSeverity != null ? { minSeverity } : {}),
  });
}

export function resolveTimeMachineApiBase(explicitBase, locationLike = globalThis.location) {
  if (typeof explicitBase === 'string' && explicitBase.trim()) {
    return explicitBase.trim().replace(/\/+$/, '');
  }
  const hostname = String(locationLike?.hostname || '').toLowerCase();
  if (!['localhost', '127.0.0.1', '::1'].includes(hostname)) return null;
  const protocol = locationLike?.protocol === 'https:' ? 'https:' : 'http:';
  return `${protocol}//${hostname}:8787`;
}

function appendFilters(params, filters) {
  if (filters.bbox) params.set('bbox', filters.bbox.join(','));
  if (filters.eventTypes?.length) params.set('types', filters.eventTypes.join(','));
  if (filters.minSeverity != null) params.set('minSeverity', String(filters.minSeverity));
}

export class TimeMachineApi {
  constructor({
    baseUrl,
    fetchImpl = globalThis.fetch?.bind(globalThis),
    pageLimit = DEFAULT_PAGE_LIMIT,
    maxItems = DEFAULT_MAX_ITEMS,
  } = {}) {
    this.baseUrl = baseUrl == null ? null : String(baseUrl).replace(/\/+$/, '');
    this.fetchImpl = fetchImpl;
    this.pageLimit = Math.max(1, Math.min(5000, Math.trunc(pageLimit)));
    this.maxItems = Math.max(this.pageLimit, Math.trunc(maxItems));
  }

  async _request(path, params, { signal } = {}) {
    if (this.baseUrl == null) throw new Error('World Intelligence API base is not configured');
    if (typeof this.fetchImpl !== 'function') throw new Error('Fetch API is unavailable');
    const search = params instanceof URLSearchParams ? params : new URLSearchParams(params || {});
    const query = search.toString();
    const response = await this.fetchImpl(`${this.baseUrl}${path}${query ? `?${query}` : ''}`, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal,
    });
    if (!response.ok) {
      let detail = '';
      try {
        const payload = await response.json();
        detail = payload?.error ? `: ${payload.error}` : '';
      } catch {
        // Keep the client error bounded and provider-agnostic.
      }
      const error = new Error(`Time Machine API ${response.status}${detail}`);
      error.status = response.status;
      throw error;
    }
    return response.json();
  }

  async coverage(filters = {}, { signal } = {}) {
    const normalized = normalizeTimeMachineFilters(filters);
    const params = new URLSearchParams();
    appendFilters(params, normalized);
    return this._request('/api/v1/time-machine/coverage', params, { signal });
  }

  async snapshot(at, filters = {}, { signal } = {}) {
    const normalized = normalizeTimeMachineFilters(filters);
    const items = [];
    let cursor = null;
    let readCutoff = null;
    let pageCount = 0;

    while (items.length < this.maxItems) {
      const params = new URLSearchParams({ at, limit: String(this.pageLimit) });
      appendFilters(params, normalized);
      if (cursor) params.set('cursor', cursor);
      const page = await this._request('/api/v1/time-machine', params, { signal });
      pageCount += 1;
      if (readCutoff == null) readCutoff = page.read_cutoff ?? null;
      const pageItems = Array.isArray(page.items) ? page.items : [];
      const remaining = this.maxItems - items.length;
      items.push(...pageItems.slice(0, remaining));

      if (!page.page?.has_more) {
        return {
          ...page,
          items,
          count: items.length,
          pages: pageCount,
          read_cutoff: readCutoff,
          truncated: false,
          filters: normalized,
        };
      }
      const nextCursor = page.page?.next_cursor;
      if (!nextCursor || nextCursor === cursor) throw new Error('Time Machine pagination cursor did not advance');
      cursor = nextCursor;
    }

    return {
      basis: 'observed_at',
      at,
      read_cutoff: readCutoff,
      items,
      count: items.length,
      pages: pageCount,
      truncated: true,
      filters: normalized,
    };
  }

  async diff(from, to, filters = {}, { signal } = {}) {
    const normalized = normalizeTimeMachineFilters(filters);
    const params = new URLSearchParams({ from, to, limit: '5000' });
    appendFilters(params, normalized);
    return this._request('/api/v1/time-machine/diff', params, { signal });
  }

  async history(sourceId, sourceObjectId, options = {}, { signal } = {}) {
    const params = new URLSearchParams({ sourceId, sourceObjectId, limit: String(options.limit ?? 1000) });
    if (options.from) params.set('from', options.from);
    if (options.to) params.set('to', options.to);
    if (options.asOf) params.set('asOf', options.asOf);
    return this._request('/api/v1/time-machine/history', params, { signal });
  }
}
