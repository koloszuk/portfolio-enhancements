import {
  ENABLE_PARALLAX, PARALLAX_INTENSITY, PARALLAX_MIN_SPEED,
  PARALLAX_MAX_SPEED, PARALLAX_SLOW_ZONE_WIDTH,
} from '../config.js';

const thumbnails = 'gallery-freeform[thumbnail-index] media-item[href]';
const navigation = '.page.pinned, nav, header, [role="navigation"]';
export const parallaxOptions = Object.freeze({
  enabled: ENABLE_PARALLAX, intensity: PARALLAX_INTENSITY,
  minimumSpeed: PARALLAX_MIN_SPEED, maximumSpeed: PARALLAX_MAX_SPEED,
  slowZoneWidth: PARALLAX_SLOW_ZONE_WIDTH,
});
export function motionProfile(viewportHeight) {
  const { intensity, minimumSpeed, maximumSpeed, slowZoneWidth } = parallaxOptions;
  // Positive derivatives prevent stopping/reversing even during calibration.
  const minimum = Math.max(0.05, 1 + intensity * (minimumSpeed - 1));
  const maximum = Math.max(minimum, 1 + intensity * (maximumSpeed - 1));
  const radius = Math.max(1, viewportHeight * Math.max(0.05, slowZoneWidth));
  const mean = (minimum + maximum) / 2;
  const tail = radius / 4;
  // A conservative bound for both the interior sine and its smooth outer tail.
  const range = Math.max(1, radius * (Math.abs(mean - 1) +
    (maximum - minimum) / (2 * Math.PI)) + Math.abs(maximum - 1) * tail / 2);
  return { minimum, maximum, radius, mean, tail, range };
}
export function offsetAtPosition(position, viewportHeight) {
  const { minimum, maximum, radius, mean, tail } = motionProfile(viewportHeight);
  const distance = Math.abs(position);
  let offset;
  if (distance <= radius) {
    // Integral of mean - (maximum-minimum)/2 * cos(PI*x/radius).
    // Its derivative is apparent scroll speed, not a time-based easing curve.
    offset = (mean - 1) * distance - (maximum - minimum) * radius /
      (2 * Math.PI) * Math.sin(Math.PI * distance / radius);
  } else {
    // Smoothly return to native speed outside the forcefield, then hold a
    // bounded offset. Continuous position/speed/acceleration at both joins.
    const u = Math.min(distance - radius, tail);
    offset = (mean - 1) * radius + (maximum - 1) *
      (u / 2 + tail / (2 * Math.PI) * Math.sin(Math.PI * u / tail));
  }
  return Math.sign(position) * offset;
}
export function offsetForBox(box, viewportHeight) {
  const nativeCenter = box.top + box.height / 2;
  return offsetAtPosition(nativeCenter - viewportHeight / 2, viewportHeight);
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
      return { top: r.top, height: r.height };
    });
    // Position, not thumbnail height, now determines speed. No collision caps
    // flatten the slow zone; temporary visual overlap remains experimental.
    const viewportHeight = document.documentElement.clientHeight;
    const { range } = motionProfile(viewportHeight);
    hosts.forEach((host, index) => {
      if (!records.has(host)) { records.set(host, { animation: null }); sizes?.observe(host); }
      const record = records.get(host);
      const figure = host.shadowRoot?.querySelector('figure[part~="figure"]');
      if (record.figure !== figure) { clear(record); record.figure = figure; record.unsupported = false; }
      if (motion.matches || !parallaxOptions.enabled || !figure || parallaxOptions.intensity === 0) { clear(record); return; }
      if (record.unsupported) return;
      if (record.range !== range) { clear(record); record.range = range; }
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
        const offset = offsetForBox(boxes[index], viewportHeight);
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
