import { ENABLE_BACKGROUND_GRID, GRID_SPACING, GRID_DOT_SIZE, HOMEPAGE_ID } from '../config.js';

function isEditor() {
  try {
    return /(?:^|\/)edit(?:\/|$)/.test(location.pathname) ||
      /(?:^|\/)edit(?:\/|$)/.test(window.top.location.pathname) ||
      !!document.querySelector('[contenteditable="true"]');
  } catch (_) { return true; }
}

export function mountHomepageBackground() {
  const layers = new Map();
  let frame = 0, stopped = false;
  function scan() {
    frame = 0;
    if (stopped) return;
    if (isEditor()) { destroy(); return; }
    const home = document.getElementById(HOMEPAGE_ID);
    for (const [page, layer] of layers) {
      if (page !== home || !page.isConnected || !layer.isConnected) { layer.remove(); layers.delete(page); }
    }
    if (!home || !home.matches('.page') || layers.has(home)) return;
    const layer = document.createElement('div');
    layer.className = 'dan-background-layer';
    layer.setAttribute('aria-hidden', 'true');
    layer.setAttribute('data-grid', String(ENABLE_BACKGROUND_GRID));
    layer.style.setProperty('--dan-grid-spacing', `${GRID_SPACING}px`);
    layer.style.setProperty('--dan-grid-dot-size', `${GRID_DOT_SIZE}px`);
    home.append(layer);
    layers.set(home, layer);
  }
  function schedule() { if (!stopped && !frame) frame = requestAnimationFrame(scan); }
  const mutations = new MutationObserver(schedule);
  if (!isEditor()) {
    mutations.observe(document.documentElement, { childList: true, subtree: true });
    schedule();
  }
  function destroy() {
    stopped = true;
    cancelAnimationFrame(frame);
    mutations.disconnect();
    for (const layer of layers.values()) layer.remove();
    layers.clear();
  }
  return { destroy };
}
