const thumbnails = 'gallery-freeform[thumbnail-index] media-item[href]';
const navigation = '.page.pinned, nav, header, [role="navigation"]';
export const parallaxOptions = Object.freeze({
  minimum: 6, maximum: 25, shortHeight: 100, tallHeight: 550,
  spacingBudget: 0.5,
});
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
export function amplitudeForHeight(height) {
  const { minimum, maximum, shortHeight, tallHeight } = parallaxOptions;
  return minimum + (maximum - minimum) * clamp((height - shortHeight) / (tallHeight - shortHeight), 0, 1);
}
export function offsetForBox(box, viewportHeight, amplitude) {
  const progress = clamp((viewportHeight - box.top) / (viewportHeight + box.height), 0, 1);
  return (0.5 - progress) * amplitude;
}
export function safeAmplitudes(boxes) {
  const amplitudes = boxes.map(box => amplitudeForHeight(box.height));
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    if (a.gallery !== b.gallery || Math.min(a.right, b.right) <= Math.max(a.left, b.left)) continue;
    const separation = Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom);
    // Disjoint pairs retain at least half their native vertical gap. Already
    // overlapping pairs retain overlap; touching pairs remain stationary.
    const budget = Math.abs(separation) * parallaxOptions.spacingBudget;
    amplitudes[i] = Math.min(amplitudes[i], budget);
    amplitudes[j] = Math.min(amplitudes[j], budget);
  }
  return amplitudes;
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
    // document coordinates or collision budgets. Twelve boxes need no cache.
    const boxes = hosts.map(host => {
      const r = host.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right,
        height: r.height, gallery: host.closest('gallery-freeform') };
    });
    const amplitudes = safeAmplitudes(boxes);
    hosts.forEach((host, index) => {
      if (!records.has(host)) { records.set(host, { animation: null }); sizes?.observe(host); }
      const record = records.get(host);
      const figure = host.shadowRoot?.querySelector('figure[part~="figure"]');
      if (record.figure !== figure) { clear(record); record.figure = figure; record.unsupported = false; }
      if (motion.matches || !figure || !amplitudes[index]) { clear(record); return; }
      if (record.unsupported) return;
      try {
        if (!record.animation) {
          // A paused additive effect is a scroll-position setter, never a
          // time-driven animation. Native transform and reveal translate survive.
          const animation = figure.animate([
            { transform: `translateY(${-parallaxOptions.maximum}px)` },
            { transform: `translateY(${parallaxOptions.maximum}px)` },
          ], { duration: 1, fill: 'both', easing: 'linear', composite: 'add' });
          animation.pause();
          if (animation.effect.composite !== 'add') {
            animation.cancel(); record.unsupported = true; return;
          }
          record.animation = animation;
        }
        const offset = offsetForBox(boxes[index], document.documentElement.clientHeight, amplitudes[index]);
        record.animation.currentTime = (offset + parallaxOptions.maximum) / (2 * parallaxOptions.maximum);
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
