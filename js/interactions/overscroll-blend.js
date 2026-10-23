import {
  ENABLE_OVERSCROLL_BLEND_WORKAROUND, OVERSCROLL_BOUNDARY_TOLERANCE,
  OVERSCROLL_EXIT_DISTANCE, OVERSCROLL_SETTLE_DELAY, OVERSCROLL_MIN_ACTIVE_DURATION, OVERSCROLL_FALLBACK_COLOR,
} from '../config.js';

export function overscrollEdge(delta, y, max, tolerance = OVERSCROLL_BOUNDARY_TOLERANCE) {
  if (delta < 0 && y <= tolerance) return 'top';
  if (delta > 0 && y >= max - tolerance) return 'bottom';
  return null;
}

const navigation = ':is(.page#I0367072328, .page#S2531296503)';
const transitionToken = '--dan-overscroll-motion-transition';
const motionProperties = 'transform translate rotate scale transform-origin width height min-width min-height max-width max-height inline-size block-size min-inline-size max-inline-size min-block-size max-block-size top right bottom left inset inset-inline inset-block margin margin-inline margin-block padding padding-inline padding-block gap row-gap column-gap font-size line-height letter-spacing font-weight font-stretch font-variation-settings border-width border-radius flex-basis'.split(' ');

// Split timing-function lists without splitting commas inside cubic-bezier/steps.
function list(value) { return value.split(/,(?![^()]*\))/).map(item => item.trim()); }
export function motionTransitions(style) {
  const durations = list(style.transitionDuration), timings = list(style.transitionTimingFunction), delays = list(style.transitionDelay);
  return list(style.transitionProperty).flatMap((property, i) => {
    if (property === 'none' || /(?:color$|^(?:fill|stroke|opacity|(?:-webkit-)?(?:backdrop-)?filter|mix-blend-mode)$)/.test(property)) return [];
    const properties = property === 'all' ? motionProperties : [property];
    return properties.map(name => `${name} ${durations[i % durations.length]} ${timings[i % timings.length]} ${delays[i % delays.length]}`);
  }).join(', ') || 'none';
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
  let edge = null, timer = 0, touchY = null, enabled = true, releaseFrame = 0;
  let activeSince = 0, lastBoundaryActivity = 0, restorationVersion = 0;
  const guarded = new Map();
  const events = new AbortController();
  const passive = { passive: true, capture: true, signal: events.signal };
  const maximum = () => Math.max(0, (document.scrollingElement || root).scrollHeight - window.innerHeight);
  function releaseTransitions() {
    cancelAnimationFrame(releaseFrame); releaseFrame = 0;
    root.classList.remove('dan-overscroll-transition-guard');
    for (const [node, saved] of guarded) {
      if (saved.value) node.style.setProperty(transitionToken, saved.value, saved.priority);
      else node.style.removeProperty(transitionToken);
    }
    guarded.clear();
  }
  function guardTransitions() {
    cancelAnimationFrame(releaseFrame); releaseFrame = 0;
    for (const node of document.querySelectorAll(`${navigation}, ${navigation} *`)) {
      if (guarded.has(node)) continue;
      const transition = motionTransitions(getComputedStyle(node));
      guarded.set(node, { value: node.style.getPropertyValue(transitionToken), priority: node.style.getPropertyPriority(transitionToken) });
      node.style.setProperty(transitionToken, transition);
    }
    if (!root.classList.contains('dan-overscroll-transition-guard')) root.classList.add('dan-overscroll-transition-guard');
  }
  function reset(immediate = false) {
    restorationVersion++;
    clearTimeout(timer); timer = 0; edge = null;
    root.classList.remove('dan-overscroll-blend');
    if (previousColor) root.style.setProperty(colorProperty, previousColor, previousPriority);
    else root.style.removeProperty(colorProperty);
    cancelAnimationFrame(releaseFrame);
    // Keep the guard through a painted native-color frame on exit. Two finite
    // callbacks, not an idle loop; cleanup events release synchronously.
    if (immediate) releaseTransitions();
    else if (root.classList.contains('dan-overscroll-transition-guard')) releaseFrame = requestAnimationFrame(() => {
      releaseFrame = requestAnimationFrame(releaseTransitions);
    });
  }
  const away = () => edge === 'top' ? window.scrollY >= OVERSCROLL_EXIT_DISTANCE
    : window.scrollY <= maximum() - OVERSCROLL_EXIT_DISTANCE;
  function settle(boundaryActivity = true) {
    clearTimeout(timer); timer = 0;
    const version = ++restorationVersion;
    if (!edge) return;
    const now = performance.now();
    if (boundaryActivity) lastBoundaryActivity = now;
    // One deadline/timer: a genuine retreat skips the quiet wait, but never the
    // minimum hold. Recheck position at expiry in case the document recoiled.
    const deadline = Math.max(activeSince + OVERSCROLL_MIN_ACTIVE_DURATION,
      away() ? now : lastBoundaryActivity + OVERSCROLL_SETTLE_DELAY);
    if (now >= deadline) { reset(); return; }
    timer = setTimeout(() => {
      if (version !== restorationVersion || !edge) return;
      timer = 0;
      settle(false);
    }, deadline - now);
  }
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
    if (!enabled || isEditor()) { reset(true); return; }
    if (!delta) return;
    if (nestedScrollConsumes(event, delta)) return;
    if (edge) {
      settle(!away()); // Small direction changes never toggle an active state.
      return;
    }
    const next = overscrollEdge(delta, window.scrollY, maximum());
    if (!next) return;
    guardTransitions();
    edge = next;
    activeSince = performance.now();
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
  const touchEnd = () => { touchY = null; if (edge) settle(!away()); };
  window.addEventListener('touchend', touchEnd, passive);
  window.addEventListener('touchcancel', () => { touchY = null; reset(true); }, passive);
  window.addEventListener('scroll', () => {
    if (!edge) return; // Reaching/resting at a boundary never activates the state.
    settle(!away()); // Extend for observable boundary activity, never move the page.
  }, passive);
  for (const name of ['blur', 'pagehide', 'pageshow', 'hashchange', 'popstate', 'resize']) {
    window.addEventListener(name, () => { touchY = null; reset(true); }, passive);
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) reset(true); }, passive);
  document.addEventListener('click', event => {
    if (event.composedPath().some(node => node.tagName === 'A' && node.hasAttribute('href'))) reset(true);
  }, passive);
  return {
    get active() { return !!edge; },
    setEnabled(value) { enabled = !!value; reset(true); },
    destroy() { enabled = false; events.abort(); reset(true); },
  };
}
