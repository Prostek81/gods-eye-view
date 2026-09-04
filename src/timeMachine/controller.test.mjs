import test from 'node:test';
import assert from 'node:assert/strict';
import { historyVisibilityGuard, orientDiffItems, TimeMachineController } from './controller.js';

class FakeEntities {
  constructor() { this.values = []; }
  add(value) { this.values.push(value); return value; }
  removeAll() { this.values.length = 0; }
}
class FakeDataSource {
  constructor(name) { this.name = name; this.entities = new FakeEntities(); }
}
const FakeCesium = {
  CustomDataSource: FakeDataSource,
  Color: {
    BLACK: { withAlpha: () => ({}) },
    fromCssColorString: () => ({ withAlpha: () => ({}) }),
  },
  Cartesian3: {
    fromDegrees: (...args) => args,
    fromDegreesArray: (args) => args,
  },
  PolygonHierarchy: class PolygonHierarchy { constructor(positions, holes = []) { this.positions = positions; this.holes = holes; } },
};

test('history visibility guard blocks live layers but allows Time Machine lifecycle', () => {
  const guard = historyVisibilityGuard(() => 'history');
  assert.match(guard({ enabled: true, origin: 'user' }), /locked/i);
  assert.equal(guard({ enabled: true, origin: 'time-machine' }), null);
  assert.equal(guard({ enabled: false, origin: 'user' }), null);
});

test('backward diff swaps entered/exited semantics and states', () => {
  const items = orientDiffItems([{ change_type: 'entered', from_state: null, to_state: { id: 1 } }], true);
  assert.equal(items[0].change_type, 'exited');
  assert.deepEqual(items[0].from_state, { id: 1 });
  assert.equal(items[0].to_state, null);
});

test('history mode isolates and then restores the exact prior live layer set', async () => {
  const guards = [];
  const restored = [];
  const dataManager = {
    getEnabledLayerIds: () => new Set(['flights', 'earthquakes']),
    addVisibilityGuard(callback) { guards.push(callback); return () => guards.splice(guards.indexOf(callback), 1); },
    async clearSelectedLayers() { return { notClearedIds: [] }; },
    async setEnabled(id, enabled) { if (enabled) restored.push(id); return true; },
  };
  const viewer = { dataSources: { add() {}, remove() {} } };
  const api = {
    async snapshot() { return { items: [], truncated: false }; },
    async diff() { return { items: [] }; },
    async coverage() { return {}; },
  };
  const controller = new TimeMachineController({ Cesium: FakeCesium, viewer, dataManager, api });
  await controller.enterHistory('2026-09-04T07:00:00.000Z');
  assert.equal(controller.getState().mode, 'history');
  assert.equal(guards.length, 1);
  assert.match(guards[0]({ enabled: true, origin: 'user' }), /locked/i);
  await controller.returnLive();
  assert.equal(controller.getState().mode, 'live');
  assert.deepEqual(restored.sort(), ['earthquakes', 'flights']);
  assert.equal(guards.length, 0);
});
