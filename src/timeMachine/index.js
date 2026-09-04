import { TimeMachineApi, resolveTimeMachineApiBase } from './api.js';
import { TimeMachineController } from './controller.js';
import { createTimeMachinePanel } from './panel.js';

export function initTimeMachine({ Cesium, viewer, dataManager, requestRender, apiBase }) {
  const baseUrl = resolveTimeMachineApiBase(apiBase);
  const api = new TimeMachineApi({ baseUrl });
  const controller = new TimeMachineController({ Cesium, viewer, dataManager, api, requestRender });
  const panel = createTimeMachinePanel(controller);

  return {
    baseUrl,
    api,
    controller,
    panel,
    async destroy() {
      panel.destroy();
      await controller.destroy();
    },
  };
}
