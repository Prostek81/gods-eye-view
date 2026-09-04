export function isoToUtcInput(iso) {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 19) : '';
}

export function utcInputToIso(value) {
  if (!value) return null;
  const ms = Date.parse(`${value}Z`);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

export function timeFromSlider(value, minIso, maxIso) {
  const min = Date.parse(minIso);
  const max = Date.parse(maxIso);
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return maxIso || minIso || null;
  const ratio = Math.max(0, Math.min(1000, Number(value))) / 1000;
  return new Date(min + ((max - min) * ratio)).toISOString();
}

export function sliderFromTime(iso, minIso, maxIso) {
  const value = Date.parse(iso);
  const min = Date.parse(minIso);
  const max = Date.parse(maxIso);
  if (![value, min, max].every(Number.isFinite) || max <= min) return 1000;
  return Math.round(Math.max(0, Math.min(1, (value - min) / (max - min))) * 1000);
}

function shortUtc(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? date.toISOString().replace('T', ' ').replace('.000Z', 'Z') : '—';
}

export function createTimeMachinePanel(controller) {
  const host = document.createElement('div');
  host.id = 'gev-time-machine';
  document.body.appendChild(host);
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      :host { position: fixed; top: 16px; right: 16px; z-index: 1300; pointer-events: none; font-family: 'JetBrains Mono', monospace; color: #e8f7ff; }
      * { box-sizing: border-box; }
      button, input { font: inherit; }
      .launch { pointer-events: auto; border: 1px solid rgba(55,213,255,.65); background: rgba(3,13,20,.86); color: #7be8ff; padding: 9px 12px; border-radius: 4px; letter-spacing: .12em; font-size: 11px; font-weight: 700; cursor: pointer; box-shadow: 0 0 18px rgba(55,213,255,.14); }
      .launch.history { color: #ffd166; border-color: rgba(255,209,102,.7); }
      .panel { pointer-events: auto; width: min(390px, calc(100vw - 24px)); margin-top: 8px; padding: 14px; border: 1px solid rgba(55,213,255,.45); border-radius: 6px; background: rgba(2,10,16,.94); backdrop-filter: blur(12px); box-shadow: 0 18px 60px rgba(0,0,0,.45); }
      .panel[hidden] { display: none; }
      header { display: flex; align-items: start; justify-content: space-between; gap: 10px; margin-bottom: 12px; }
      h2 { margin: 0; font-size: 13px; letter-spacing: .12em; color: #9defff; }
      .mode { display: inline-block; margin-top: 4px; font-size: 10px; color: #7d929d; }
      .mode.history { color: #ffd166; }
      .close { border: 0; background: transparent; color: #879aa4; cursor: pointer; font-size: 18px; }
      .coverage { font-size: 10px; line-height: 1.55; color: #91a8b2; border-top: 1px solid rgba(255,255,255,.08); padding-top: 10px; }
      .coverage strong { color: #d8f6ff; font-weight: 500; }
      .scrubber { width: 100%; margin: 14px 0 8px; accent-color: #37d5ff; }
      .time-row { display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: center; }
      .time-row input { width: 100%; min-width: 0; color-scheme: dark; background: #07131a; color: #dff8ff; border: 1px solid rgba(255,255,255,.16); border-radius: 4px; padding: 8px; font-size: 11px; }
      .utc { font-size: 9px; color: #6f8791; }
      .actions { display: grid; grid-template-columns: 1fr .65fr; gap: 8px; margin-top: 12px; }
      .actions button { border-radius: 4px; border: 1px solid rgba(55,213,255,.48); background: rgba(7,28,38,.9); color: #9defff; padding: 9px; cursor: pointer; font-size: 10px; letter-spacing: .06em; }
      .actions button.live { border-color: rgba(255,209,102,.5); color: #ffd166; }
      .actions button:disabled { opacity: .45; cursor: wait; }
      .status { margin-top: 12px; min-height: 38px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,.08); font-size: 10px; line-height: 1.5; color: #91a8b2; }
      .status .error { color: #ff7b8a; }
      .status .warn { color: #ffd166; }
      .lock { color: #ffd166; }
      @media (max-width: 680px) { :host { top: 72px; right: 12px; } .panel { width: calc(100vw - 24px); } }
    </style>
    <button class="launch" type="button" aria-expanded="false">TIME</button>
    <section class="panel" hidden aria-label="Time Machine controls">
      <header>
        <div><h2>TIME MACHINE</h2><span class="mode">LIVE</span></div>
        <button class="close" type="button" aria-label="Close Time Machine panel">×</button>
      </header>
      <div class="coverage">COVERAGE · <strong class="coverage-range">not loaded</strong></div>
      <input class="scrubber" type="range" min="0" max="1000" step="1" value="1000" disabled aria-label="Historical time scrubber" />
      <div class="time-row">
        <input class="datetime" type="datetime-local" step="1" aria-label="Historical timestamp in UTC" />
        <span class="utc">UTC</span>
      </div>
      <div class="actions">
        <button class="apply" type="button">LOAD HISTORY</button>
        <button class="live" type="button">RETURN LIVE</button>
      </div>
      <div class="status" role="status" aria-live="polite">Open coverage to begin.</div>
    </section>
  `;

  const launch = root.querySelector('.launch');
  const panel = root.querySelector('.panel');
  const close = root.querySelector('.close');
  const mode = root.querySelector('.mode');
  const coverageRange = root.querySelector('.coverage-range');
  const scrubber = root.querySelector('.scrubber');
  const datetime = root.querySelector('.datetime');
  const apply = root.querySelector('.apply');
  const live = root.querySelector('.live');
  const status = root.querySelector('.status');
  let selectedAt = null;
  let coverageLoaded = false;
  let latestState = controller.getState();

  const coverageBounds = () => {
    const coverage = latestState.coverage;
    return {
      min: coverage?.min_observed_at ?? null,
      max: coverage?.max_observed_at ?? null,
    };
  };

  const setSelectedAt = (iso) => {
    if (!iso) return;
    selectedAt = iso;
    datetime.value = isoToUtcInput(iso);
    const { min, max } = coverageBounds();
    if (min && max) scrubber.value = String(sliderFromTime(iso, min, max));
  };

  const render = (state) => {
    latestState = state;
    const history = state.mode === 'history' || state.mode === 'entering' || state.mode === 'leaving';
    launch.classList.toggle('history', history);
    launch.textContent = history ? 'TIME · HIST' : 'TIME';
    mode.classList.toggle('history', history);
    mode.textContent = state.mode === 'live' ? 'LIVE' : state.mode.toUpperCase();
    apply.disabled = Boolean(state.busy);
    live.disabled = Boolean(state.busy || state.mode === 'live');

    if (state.coverage) {
      const min = state.coverage.min_observed_at;
      const max = state.coverage.max_observed_at;
      coverageRange.textContent = `${shortUtc(min)} → ${shortUtc(max)}`;
      scrubber.disabled = !(min && max);
      if (!selectedAt && max) setSelectedAt(max);
    }
    if (state.at) setSelectedAt(state.at);

    const lines = [];
    if (state.mode === 'history') lines.push(`<span class="lock">HISTORY · LIVE LAYERS LOCKED</span>`);
    if (state.mode === 'history') lines.push(`${state.itemCount} historical entities · ${state.diffCount} changes`);
    if (state.truncated) lines.push('<span class="warn">render/client safety cap reached</span>');
    if (state.warning) lines.push(`<span class="warn"></span>`);
    if (state.error) lines.push(`<span class="error"></span>`);
    status.innerHTML = lines.length ? lines.join('<br>') : (state.busy ? 'Loading…' : 'Ready.');
    const warn = status.querySelector('.warn:last-child');
    if (warn && state.warning) warn.textContent = state.warning;
    const error = status.querySelector('.error');
    if (error && state.error) error.textContent = state.error;
  };

  const unsubscribe = controller.subscribe(render);

  async function ensureCoverage() {
    if (coverageLoaded) return;
    try {
      const coverage = await controller.loadCoverage();
      coverageLoaded = true;
      if (coverage?.max_observed_at) setSelectedAt(coverage.max_observed_at);
    } catch {
      // Controller state already exposes the bounded error.
    }
  }

  launch.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    launch.setAttribute('aria-expanded', panel.hidden ? 'false' : 'true');
    if (!panel.hidden) void ensureCoverage();
  });
  close.addEventListener('click', () => {
    panel.hidden = true;
    launch.setAttribute('aria-expanded', 'false');
  });
  scrubber.addEventListener('input', () => {
    const { min, max } = coverageBounds();
    const iso = timeFromSlider(scrubber.value, min, max);
    if (iso) {
      selectedAt = iso;
      datetime.value = isoToUtcInput(iso);
    }
  });
  scrubber.addEventListener('change', () => {
    if (latestState.mode === 'history' && selectedAt) void controller.setTime(selectedAt).catch(() => {});
  });
  datetime.addEventListener('change', () => {
    const iso = utcInputToIso(datetime.value);
    if (iso) setSelectedAt(iso);
  });
  apply.addEventListener('click', async () => {
    const iso = utcInputToIso(datetime.value) || selectedAt;
    if (!iso) return;
    try {
      if (latestState.mode === 'history') await controller.setTime(iso);
      else await controller.enterHistory(iso);
    } catch {
      // Controller state owns the visible error.
    }
  });
  live.addEventListener('click', () => void controller.returnLive());

  return {
    host,
    destroy() {
      unsubscribe();
      host.remove();
    },
  };
}
