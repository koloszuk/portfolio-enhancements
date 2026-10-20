import {
  ENABLE_PARALLAX, PARALLAX_INTENSITY, MIN_PARALLAX_OFFSET, MAX_PARALLAX_OFFSET,
  PARALLAX_SHORT_HEIGHT, PARALLAX_TALL_HEIGHT,
} from '../config.js';

const thumbnails = 'gallery-freeform[thumbnail-index] media-item[href]';
const navigation = '.page.pinned, nav, header, [role="navigation"]';
export const parallaxOptions = Object.freeze({
  enabled: ENABLE_PARALLAX, intensity: PARALLAX_INTENSITY,
  minimum: MIN_PARALLAX_OFFSET, maximum: MAX_PARALLAX_OFFSET,
  shortHeight: PARALLAX_SHORT_HEIGHT, tallHeight: PARALLAX_TALL_HEIGHT,
});
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
export function maxOffsetForHeight(height) {
  const { minimum, maximum, shortHeight, tallHeight, intensity } = parallaxOptions;
  const fraction = clamp((height - shortHeight) / (tallHeight - shortHeight), 0, 1);
  return (minimum + (maximum - minimum) * fraction) * intensity;
}
export function offsetForBox(box, viewportHeight, maximumOffset) {
  const progress = clamp((viewportHeight - box.top) / (viewportHeight + box.height), 0, 1);
  return (1 - 2 * progress) * maximumOffset;
}
function isEditor() {
  try {
    return /(?:^|\/)edit(?:\/|$)/.test(location.pathname) ||
      /(?:^|\/)edit(?:\/|$)/.test(window.top.location.pathname) ||
      !!document.querySelector('[contenteditable="true"]');
  } catch (_) { return true; }
}
export function mountScrollParallax() {
  const records = new Map();
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let frame = 0, stopped = false;
  function clear(record) { record.animation?.cancel(); record.animation = null; }
  function update() {
    frame = 0;
    if (stopped) return;
    if (isEditor()) { destroy(); return; }
    const hosts = Array.from(document.querySelectorAll(thumbnails)).filter(h => !h.closest(navigation));
    const active = new Set(hosts);
    for (const [host, record] of records) if (!active.has(host)) {
      clear(record); sizes?.unobserve(host); records.delete(host);
    }
    // Read only Cargo's stationary host boxes, never our transformed figures.
    // Re-read before writes so responsive/freeform changes cannot leave stale
    // document coordinates. Twelve stationary host boxes need no cache.
    const boxes = hosts.map(host => {
      const r = host.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right,
        height: r.height, gallery: host.closest('gallery-freeform') };
    });
    // Calibration: no neighbor caps. Keep size differences visible, allowing
    // temporary visual overlaps without changing Cargo layout coordinates.
    const maxima = boxes.map(box => maxOffsetForHeight(box.height));
    const range = parallaxOptions.maximum * parallaxOptions.intensity;
    hosts.forEach((host, index) => {
      if (!records.has(host)) { records.set(host, { animation: null }); sizes?.observe(host); }
      const record = records.get(host);
      const figure = host.shadowRoot?.querySelector('figure[part~="figure"]');
      if (record.figure !== figure) { clear(record); record.figure = figure; record.unsupported = false; }
      if (motion.matches || !parallaxOptions.enabled || !figure || !maxima[index]) { clear(record); return; }
      if (record.unsupported) return;
      try {
        if (!record.animation) {
          // A paused additive effect is a scroll-position setter, never a
          // time-driven animation. Native transform and reveal translate survive.
          const animation = figure.animate([
            { transform: `translateY(${-range}px)` },
            { transform: `translateY(${range}px)` },
          ], { duration: 1, fill: 'both', easing: 'linear', composite: 'add' });
          animation.pause();
          if (animation.effect.composite !== 'add') {
            animation.cancel(); record.unsupported = true; return;
          }
          record.animation = animation;
        }
        const offset = offsetForBox(boxes[index], document.documentElement.clientHeight, maxima[index]);
        record.animation.currentTime = (offset + range) / (2 * range);
      } catch (_) { clear(record); record.unsupported = true; }
    });
    // No next frame: only a scroll/layout/preference event schedules an update.
  }
  function schedule() { if (!stopped && !frame) frame = requestAnimationFrame(update); }
  function preferencesChanged() {
    if (motion.matches) for (const record of records.values()) clear(record);
    schedule();
  }
  const sizes = 'ResizeObserver' in window ? new ResizeObserver(schedule) : null;
  const mutations = new MutationObserver(schedule);
  if (!isEditor()) {
    mutations.observe(document.documentElement, {
      childList: true, subtree: true, attributes: true,
      attributeFilter: ['href', 'class', 'style', 'freeform-x', 'freeform-y', 'freeform-scale'],
    });
    sizes?.observe(document.documentElement);
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    window.addEventListener('pageshow', schedule);
    document.addEventListener('visibilitychange', schedule);
    motion.addEventListener('change', preferencesChanged);
    customElements.whenDefined('media-item').then(schedule);
    schedule();
  }
  function destroy() {
    stopped = true;
    cancelAnimationFrame(frame); sizes?.disconnect(); mutations.disconnect();
    window.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', schedule);
    window.removeEventListener('pageshow', schedule);
    document.removeEventListener('visibilitychange', schedule);
    motion.removeEventListener('change', preferencesChanged);
    for (const record of records.values()) clear(record);
    records.clear();
  }
  return { get count() { return records.size; }, destroy };
}
