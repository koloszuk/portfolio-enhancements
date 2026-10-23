import {
  ENABLE_OVERSCROLL_BLEND_WORKAROUND, OVERSCROLL_BOUNDARY_TOLERANCE,
  OVERSCROLL_SETTLE_DELAY, OVERSCROLL_FALLBACK_COLOR,
} from '../config.js';

export function overscrollEdge(delta, y, max, tolerance = OVERSCROLL_BOUNDARY_TOLERANCE) {
  if (delta < 0 && y <= tolerance) return 'top';
  if (delta > 0 && y >= max - tolerance) return 'bottom';
  return null;
}

function isEditor() {
  try {
    return /(?:^|\/)edit(?:\/|$)/.test(location.pathname) ||
      /(?:^|\/)edit(?:\/|$)/.test(window.top.location.pathname) ||
      !!document.querySelector('[contenteditable="true"]');
  } catch (_) { return true; }
}

export function mountOverscrollBlendWorkaround() {
  if (!ENABLE_OVERSCROLL_BLEND_WORKAROUND || isEditor()) return { destroy() {}, setEnabled() {}, active: false };
  const root = document.documentElement;
  const colorProperty = '--dan-overscroll-fallback-color';
  const previousColor = root.style.getPropertyValue(colorProperty);
  const previousPriority = root.style.getPropertyPriority(colorProperty);
  let edge = null, timer = 0, touchY = null, enabled = true;
  const events = new AbortController();
  const passive = { passive: true, capture: true, signal: events.signal };
  const maximum = () => Math.max(0, (document.scrollingElement || root).scrollHeight - window.innerHeight);
  function reset() {
    clearTimeout(timer); timer = 0; edge = null;
    root.classList.remove('dan-overscroll-blend');
    if (previousColor) root.style.setProperty(colorProperty, previousColor, previousPriority);
    else root.style.removeProperty(colorProperty);
  }
  function settle() { clearTimeout(timer); timer = setTimeout(reset, OVERSCROLL_SETTLE_DELAY); }
  function nestedScrollConsumes(event, delta) {
    // Ignore scrollable controls and contained panels. Iframe events do not
    // bubble into this document, so About Selfie retains its own interaction.
    for (const node of event.composedPath()) {
      if (node === document.body || node === root) break;
      if (node.nodeType !== 1 || node.scrollHeight <= node.clientHeight + 1) continue;
      const style = getComputedStyle(node);
      if (!/auto|scroll|overlay/.test(style.overflowY)) continue;
      const max = node.scrollHeight - node.clientHeight;
      if ((delta < 0 && node.scrollTop > 0) || (delta > 0 && node.scrollTop < max) ||
          /contain|none/.test(style.overscrollBehaviorY)) return true;
    }
    return false;
  }
  function intent(delta, event) {
    if (!enabled || isEditor()) { reset(); return; }
    if (!delta) return;
    if (edge && ((edge === 'top' && delta > 0) || (edge === 'bottom' && delta < 0))) { reset(); return; }
    const next = overscrollEdge(delta, window.scrollY, maximum());
    if (!next || nestedScrollConsumes(event, delta)) { if (edge) reset(); return; }
    edge = next;
    root.style.setProperty(colorProperty, OVERSCROLL_FALLBACK_COLOR);
    if (!root.classList.contains('dan-overscroll-blend')) root.classList.add('dan-overscroll-blend');
    settle();
  }
  window.addEventListener('wheel', event => {
    if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    intent(event.deltaY, event);
  }, passive);
  window.addEventListener('touchstart', event => {
    touchY = event.touches.length === 1 ? event.touches[0].clientY : null;
  }, passive);
  window.addEventListener('touchmove', event => {
    if (event.touches.length !== 1) { touchY = null; reset(); return; }
    const y = event.touches[0].clientY;
    if (touchY !== null) intent(touchY - y, event);
    touchY = y;
  }, passive);
  const touchEnd = () => { touchY = null; if (edge) settle(); };
  window.addEventListener('touchend', touchEnd, passive);
  window.addEventListener('touchcancel', () => { touchY = null; reset(); }, passive);
  window.addEventListener('scroll', () => {
    if (!edge) return; // Reaching/resting at a boundary never activates the state.
    if ((edge === 'top' && window.scrollY > OVERSCROLL_BOUNDARY_TOLERANCE) ||
        (edge === 'bottom' && window.scrollY < maximum() - OVERSCROLL_BOUNDARY_TOLERANCE)) reset();
    else settle(); // Extend for observable bounce/scroll activity, never move the page.
  }, passive);
  for (const name of ['blur', 'pagehide', 'pageshow', 'hashchange', 'popstate', 'resize']) {
    window.addEventListener(name, () => { touchY = null; reset(); }, passive);
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) reset(); }, passive);
  document.addEventListener('click', event => {
    if (event.composedPath().some(node => node.tagName === 'A' && node.hasAttribute('href'))) reset();
  }, passive);
  return {
    get active() { return !!edge; },
    setEnabled(value) { enabled = !!value; reset(); },
    destroy() { enabled = false; events.abort(); reset(); },
  };
}
