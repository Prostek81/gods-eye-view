import { normalizeTimeMachineFilters } from './api.js';

const HISTORY_ORIGIN = 'time-machine';
const HISTORY_GUARD_REASON = 'Live layers are locked while Time Machine history mode is active';

function isoTimestamp(value) {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) throw new Error('Time Machine timestamp is invalid');
  return new Date(ms).toISOString();
}

export function historyVisibilityGuard(modeProvider) {
  return (change) => {
    const mode = typeof modeProvider === 'function' ? modeProvider() : modeProvider;
    if (mode === 'live' || !change?.enabled || change.origin === HISTORY_ORIGIN) return null;
    return HISTORY_GUARD_REASON;
  };
}

export function orientDiffItems(items, backwards = false) {
  if (!backwards) return Array.isArray(items) ? items : [];
  return (Array.isArray(items) ? items : []).map((item) => ({
    ...item,
    change_type: item.change_type === 'entered'
      ? 'exited'
      : (item.change_type === 'exited' ? 'entered' : item.change_type),
    from_state: item.to_state,
    to_state: item.from_state,
  }));
}

function severityCss(value) {
  const severity = Number(value);
  if (severity >= 75) return '#ff4d4f';
  if (severity >= 50) return '#ffb020';
  if (severity >= 25) return '#7ee787';
  return '#37d5ff';
}

function diffCss(changeType) {
  if (changeType === 'entered') return '#40e58c';
  if (changeType === 'exited') return '#ff5c72';
  return '#ffd166';
}

function color(Cesium, css, alpha = 1) {
  const base = Cesium.Color.fromCssColorString(css);
  return alpha === 1 ? base : base.withAlpha(alpha);
}

function ringHierarchy(Cesium, rings) {
  if (!Array.isArray(rings) || !rings.length) return null;
  const positions = Cesium.Cartesian3.fromDegreesArray(rings[0].flatMap(([lon, lat]) => [Number(lon), Number(lat)]));
  const holes = rings.slice(1).map((ring) => new Cesium.PolygonHierarchy(
    Cesium.Cartesian3.fromDegreesArray(ring.flatMap(([lon, lat]) => [Number(lon), Number(lat)])),
  ));
  return new Cesium.PolygonHierarchy(positions, holes);
}

function entityMetadata(item, historicalAt, changeType = null) {
  return {
    timeMachine: true,
    historicalAt,
    sourceId: item.source_id ?? null,
    sourceObjectId: item.source_object_id ?? null,
    observedAt: item.observed_at ?? null,
    sourceRevisionAt: item.source_revision_at ?? null,
    severity: item.severity ?? null,
    eventStatus: item.event_status ?? null,
    licenseClass: item.license_class ?? null,
    attribution: item.attribution ?? null,
    ...(changeType ? { changeType } : {}),
  };
}

function addGeometryEntities({ Cesium, dataSource, geometry, item, historicalAt, css, diff = false, suffix = '' }) {
  if (!geometry || !Array.isArray(geometry.coordinates)) return 0;
  const idBase = `tm:${item.source_id ?? 'source'}:${item.source_object_id ?? item.id ?? 'item'}${suffix}`;
  const displayName = `${item.title || item.source_object_id || item.entity_type || 'Historical event'} · HISTORY`;
  const primary = color(Cesium, css);
  const metadata = entityMetadata(item, historicalAt, item.change_type ?? null);
  let added = 0;

  const addPoint = (coordinates, idSuffix = '') => {
    const [lon, lat, embeddedAltitude] = coordinates;
    if (![lon, lat].every((value) => Number.isFinite(Number(value)))) return;
    const altitude = Number.isFinite(Number(item.altitude_m))
      ? Number(item.altitude_m)
      : (Number.isFinite(Number(embeddedAltitude)) ? Number(embeddedAltitude) : 0);
    dataSource.entities.add({
      id: `${idBase}${idSuffix}`,
      name: displayName,
      position: Cesium.Cartesian3.fromDegrees(Number(lon), Number(lat), altitude),
      point: {
        pixelSize: diff ? 14 : 10,
        color: diff ? primary.withAlpha(0.92) : primary.withAlpha(0.82),
        outlineColor: Cesium.Color.BLACK.withAlpha(0.8),
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      properties: metadata,
    });
    added += 1;
  };

  const addLine = (coordinates, idSuffix = '') => {
    const flat = coordinates.flatMap(([lon, lat]) => [Number(lon), Number(lat)]);
    if (flat.length < 4 || flat.some((value) => !Number.isFinite(value))) return;
    dataSource.entities.add({
      id: `${idBase}${idSuffix}`,
      name: displayName,
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArray(flat),
        width: diff ? 5 : 3,
        material: primary.withAlpha(diff ? 0.92 : 0.72),
        clampToGround: true,
      },
      properties: metadata,
    });
    added += 1;
  };

  const addPolygon = (rings, idSuffix = '') => {
    const hierarchy = ringHierarchy(Cesium, rings);
    if (!hierarchy) return;
    dataSource.entities.add({
      id: `${idBase}${idSuffix}`,
      name: displayName,
      polygon: {
        hierarchy,
        material: primary.withAlpha(diff ? 0.24 : 0.16),
        outline: true,
        outlineColor: primary.withAlpha(0.95),
      },
      properties: metadata,
    });
    added += 1;
  };

  switch (geometry.type) {
    case 'Point': addPoint(geometry.coordinates); break;
    case 'MultiPoint': geometry.coordinates.forEach((point, index) => addPoint(point, `:${index}`)); break;
    case 'LineString': addLine(geometry.coordinates); break;
    case 'MultiLineString': geometry.coordinates.forEach((line, index) => addLine(line, `:${index}`)); break;
    case 'Polygon': addPolygon(geometry.coordinates); break;
    case 'MultiPolygon': geometry.coordinates.forEach((polygon, index) => addPolygon(polygon, `:${index}`)); break;
    default: break;
  }
  return added;
}

export class TimeMachineController {
  constructor({ Cesium, viewer, dataManager, api, requestRender = () => {}, maxRenderItems = 5000 }) {
    if (!Cesium || !viewer || !dataManager || !api) throw new Error('Time Machine controller dependencies are required');
    this.Cesium = Cesium;
    this.viewer = viewer;
    this.dataManager = dataManager;
    this.api = api;
    this.requestRender = requestRender;
    this.maxRenderItems = maxRenderItems;
    this.mode = 'live';
    this.currentAt = null;
    this.filters = normalizeTimeMachineFilters();
    this.coverage = null;
    this._listeners = new Set();
    this._savedLiveLayerIds = new Set();
    this._removeVisibilityGuard = null;
    this._loadAbort = null;
    this._state = {
      mode: 'live',
      busy: false,
      at: null,
      coverage: null,
      itemCount: 0,
      diffCount: 0,
      truncated: false,
      error: null,
      warning: null,
    };

    this.historyDataSource = new Cesium.CustomDataSource('time-machine-history');
    this.diffDataSource = new Cesium.CustomDataSource('time-machine-diff');
    this.viewer.dataSources.add(this.historyDataSource);
    this.viewer.dataSources.add(this.diffDataSource);
  }

  getState() {
    return { ...this._state };
  }

  subscribe(callback) {
    if (typeof callback !== 'function') return () => {};
    this._listeners.add(callback);
    callback(this.getState());
    return () => this._listeners.delete(callback);
  }

  _emit(patch = {}) {
    this._state = { ...this._state, ...patch };
    for (const callback of this._listeners) {
      try { callback(this.getState()); } catch (error) { console.warn('[TimeMachine] listener error:', error); }
    }
  }

  _cancelLoad() {
    this._loadAbort?.abort();
    this._loadAbort = null;
  }

  async loadCoverage(filters = this.filters) {
    const normalized = normalizeTimeMachineFilters(filters);
    this._emit({ busy: true, error: null });
    try {
      const coverage = await this.api.coverage(normalized);
      this.coverage = coverage;
      this._emit({ coverage, busy: false, error: null });
      return coverage;
    } catch (error) {
      this._emit({ busy: false, error: String(error?.message || error) });
      throw error;
    }
  }

  async enterHistory(at, filters = {}) {
    if (this.mode === 'history') return this.setTime(at, filters);
    const targetAt = isoTimestamp(at);
    const normalized = normalizeTimeMachineFilters(filters);
    this._cancelLoad();
    const controller = new AbortController();
    this._loadAbort = controller;
    this._emit({ busy: true, error: null, warning: null });

    try {
      // Fetch first so a network/API failure never tears down a healthy live scene.
      const snapshot = await this.api.snapshot(targetAt, normalized, { signal: controller.signal });
      if (controller.signal.aborted) return this.getState();

      this.mode = 'entering';
      this._savedLiveLayerIds = this.dataManager.getEnabledLayerIds();
      this._removeVisibilityGuard = this.dataManager.addVisibilityGuard(historyVisibilityGuard(() => this.mode));
      const clearResult = await this.dataManager.clearSelectedLayers({ origin: HISTORY_ORIGIN });
      if (clearResult.notClearedIds?.length) {
        throw new Error(`Could not isolate history mode: ${clearResult.notClearedIds.join(', ')}`);
      }

      this._renderSnapshot(snapshot.items, targetAt);
      this.diffDataSource.entities.removeAll();
      this.mode = 'history';
      this.currentAt = targetAt;
      this.filters = normalized;
      this._emit({
        mode: 'history',
        busy: false,
        at: targetAt,
        itemCount: Math.min(snapshot.items.length, this.maxRenderItems),
        diffCount: 0,
        truncated: Boolean(snapshot.truncated || snapshot.items.length > this.maxRenderItems),
        error: null,
        warning: snapshot.truncated ? 'Snapshot reached the client safety cap' : null,
      });
      this.requestRender('time-machine-enter');
      return this.getState();
    } catch (error) {
      if (error?.name !== 'AbortError') await this._rollbackToLive(error);
      if (error?.name === 'AbortError') return this.getState();
      throw error;
    } finally {
      if (this._loadAbort === controller) this._loadAbort = null;
    }
  }

  async setTime(at, filters = this.filters) {
    if (this.mode !== 'history') return this.enterHistory(at, filters);
    const targetAt = isoTimestamp(at);
    const normalized = normalizeTimeMachineFilters(filters);
    this._cancelLoad();
    const controller = new AbortController();
    this._loadAbort = controller;
    const previousAt = this.currentAt;
    this._emit({ busy: true, error: null, warning: null });

    try {
      let diffPromise = Promise.resolve({ items: [] });
      let backwards = false;
      if (previousAt && previousAt !== targetAt) {
        backwards = Date.parse(targetAt) < Date.parse(previousAt);
        const from = backwards ? targetAt : previousAt;
        const to = backwards ? previousAt : targetAt;
        diffPromise = this.api.diff(from, to, normalized, { signal: controller.signal })
          .catch((error) => ({ items: [], error }));
      }
      const [snapshot, rawDiff] = await Promise.all([
        this.api.snapshot(targetAt, normalized, { signal: controller.signal }),
        diffPromise,
      ]);
      if (controller.signal.aborted) return this.getState();

      const diffItems = orientDiffItems(rawDiff.items, backwards);
      this._renderSnapshot(snapshot.items, targetAt);
      this._renderDiff(diffItems, targetAt);
      this.currentAt = targetAt;
      this.filters = normalized;
      this._emit({
        mode: 'history',
        busy: false,
        at: targetAt,
        itemCount: Math.min(snapshot.items.length, this.maxRenderItems),
        diffCount: diffItems.length,
        truncated: Boolean(snapshot.truncated || snapshot.items.length > this.maxRenderItems),
        error: null,
        warning: rawDiff.error ? `Diff unavailable: ${rawDiff.error.message || rawDiff.error}` : null,
      });
      this.requestRender('time-machine-scrub');
      return this.getState();
    } catch (error) {
      if (error?.name === 'AbortError') return this.getState();
      this._emit({ busy: false, error: String(error?.message || error) });
      throw error;
    } finally {
      if (this._loadAbort === controller) this._loadAbort = null;
    }
  }

  async returnLive() {
    if (this.mode === 'live') return this.getState();
    this._cancelLoad();
    this.mode = 'leaving';
    this._emit({ busy: true, mode: 'leaving', error: null });
    this.historyDataSource.entities.removeAll();
    this.diffDataSource.entities.removeAll();

    const restoreIds = [...this._savedLiveLayerIds];
    const results = await Promise.allSettled(restoreIds.map((layerId) => (
      this.dataManager.setEnabled(layerId, true, { origin: HISTORY_ORIGIN })
    )));
    const failed = restoreIds.filter((_, index) => (
      results[index]?.status === 'rejected' || results[index]?.value === false
    ));

    this._removeVisibilityGuard?.();
    this._removeVisibilityGuard = null;
    this._savedLiveLayerIds = new Set();
    this.mode = 'live';
    this.currentAt = null;
    this._emit({
      mode: 'live',
      busy: false,
      at: null,
      itemCount: 0,
      diffCount: 0,
      truncated: false,
      error: failed.length ? `Live layer restore incomplete: ${failed.join(', ')}` : null,
      warning: null,
    });
    this.requestRender('time-machine-live');
    return this.getState();
  }

  async _rollbackToLive(error) {
    this.historyDataSource.entities.removeAll();
    this.diffDataSource.entities.removeAll();
    const restoreIds = [...this._savedLiveLayerIds];
    await Promise.allSettled(restoreIds.map((layerId) => this.dataManager.setEnabled(layerId, true, { origin: HISTORY_ORIGIN })));
    this._removeVisibilityGuard?.();
    this._removeVisibilityGuard = null;
    this._savedLiveLayerIds = new Set();
    this.mode = 'live';
    this.currentAt = null;
    this._emit({ mode: 'live', busy: false, at: null, error: String(error?.message || error) });
  }

  _renderSnapshot(items, historicalAt) {
    this.historyDataSource.entities.removeAll();
    let rendered = 0;
    for (const item of (Array.isArray(items) ? items : []).slice(0, this.maxRenderItems)) {
      rendered += addGeometryEntities({
        Cesium: this.Cesium,
        dataSource: this.historyDataSource,
        geometry: item.geometry,
        item,
        historicalAt,
        css: severityCss(item.severity),
      });
    }
    return rendered;
  }

  _renderDiff(items, historicalAt) {
    this.diffDataSource.entities.removeAll();
    let rendered = 0;
    for (const item of (Array.isArray(items) ? items : []).slice(0, this.maxRenderItems)) {
      const state = item.change_type === 'exited' ? item.from_state : item.to_state;
      if (!state) continue;
      rendered += addGeometryEntities({
        Cesium: this.Cesium,
        dataSource: this.diffDataSource,
        geometry: state.geometry,
        item: {
          ...state,
          source_id: item.source_id,
          source_object_id: item.source_object_id,
          change_type: item.change_type,
        },
        historicalAt,
        css: diffCss(item.change_type),
        diff: true,
        suffix: ':diff',
      });
    }
    return rendered;
  }

  async destroy() {
    await this.returnLive();
    this.viewer.dataSources.remove(this.historyDataSource, true);
    this.viewer.dataSources.remove(this.diffDataSource, true);
    this._listeners.clear();
  }
}
