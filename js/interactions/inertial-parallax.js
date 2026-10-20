const thumbnails = 'gallery-freeform[thumbnail-index] media-item[href]';
const navigation = '.page.pinned, nav, header, [role="navigation"]';
export const parallaxOptions = Object.freeze({ maximum: 12, response: 85, decay: 110 });
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
export const heightWeight = height => clamp(height / 550, 0.15, 1);
export const approach = (value, target, milliseconds, constant) =>
  target + (value - target) * Math.exp(-milliseconds / constant);

function isEditor() {
  try {
    return /(?:^|\/)edit(?:\/|$)/.test(location.pathname) ||
      /(?:^|\/)edit(?:\/|$)/.test(window.top.location.pathname) ||
      !!document.querySelector('[contenteditable="true"]');
  } catch (_) { return true; }
}

export function mountInertialParallax() {
  const records = new Map();
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let frame = 0, scanFrame = 0, previousTime = 0, velocity = 0, stopped = false;
  function position() {
    const root = document.scrollingElement || document.documentElement;
    return clamp(window.scrollY || 0, 0,
      Math.max(0, root.scrollHeight - document.documentElement.clientHeight));
  }
  let lastPosition = position(), lastInput = performance.now();
  function clear(record) {
    record.animation?.cancel();
    record.animation = null;
    record.offset = 0;
  }
  function reset() {
    cancelAnimationFrame(frame);
    frame = 0;
    previousTime = 0;
    velocity = 0;
    lastPosition = position();
    lastInput = performance.now();
    for (const record of records.values()) clear(record);
  }
  function tick(time) {
    frame = 0;
    if (stopped || motion.matches || document.hidden) { reset(); return; }
    if (isEditor()) { destroy(); return; }
    const dt = Math.min(64, previousTime ? time - previousTime : 16.67);
    previousTime = time;
    velocity = approach(velocity, 0, dt, parallaxOptions.decay);
    let moving = Math.abs(velocity) > 0.002;
    for (const [host, record] of records) {
      if (!record.visible || !host.isConnected) { clear(record); continue; }
      const figure = host.shadowRoot?.querySelector('figure[part~="figure"]');
      if (!figure || record.unsupported) continue;
      if (record.figure !== figure) { clear(record); record.figure = figure; }
      const target = -clamp(velocity / 1.2, -1, 1) *
        parallaxOptions.maximum * heightWeight(record.height);
      record.offset = approach(record.offset, target, dt, parallaxOptions.response);
      if (Math.abs(record.offset) < 0.02 && Math.abs(target) < 0.02) {
        clear(record);
        continue;
      }
      try {
        if (!record.animation) {
          // Add to the native transform instead of replacing it. The reveal's
          // separate CSS translate continues to compose with this effect.
          const animation = figure.animate([
            { transform: 'translateY(-12px)' }, { transform: 'translateY(12px)' },
          ], { duration: 1, fill: 'both', composite: 'add' });
          animation.pause();
          if (animation.effect.composite !== 'add') {
            animation.cancel(); record.unsupported = true; continue;
          }
          record.animation = animation;
        }
        record.animation.currentTime = (record.offset + 12) / 24;
        moving = true;
      } catch (_) { clear(record); record.unsupported = true; }
    }
    if (moving) frame = requestAnimationFrame(tick);
    else previousTime = 0;
  }
  function scroll() {
    const next = position(), now = performance.now();
    const delta = next - lastPosition;
    lastPosition = next;
    if (!delta || motion.matches || document.hidden) return;
    // Long pauses never turn the next wheel event into a large time interval.
    const elapsed = clamp(now - lastInput, 8, 50);
    lastInput = now;
    velocity = clamp(delta / elapsed, -3, 3);
    if (!frame) frame = requestAnimationFrame(tick);
  }
  const visibility = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    for (const entry of entries) {
      const record = records.get(entry.target);
      if (record) { record.visible = entry.isIntersecting; if (!record.visible) clear(record); }
    }
  }, { rootMargin: '24px', threshold: 0 }) : null;
  const sizes = 'ResizeObserver' in window ? new ResizeObserver(entries => {
    for (const entry of entries) {
      const record = records.get(entry.target);
      if (record) record.height = entry.target.getBoundingClientRect().height;
    }
  }) : null;
  function scan() {
    scanFrame = 0;
    if (stopped) return;
    if (isEditor()) { destroy(); return; }
    for (const [host, record] of records) {
      if (!host.isConnected || !host.matches(thumbnails) || host.closest(navigation)) {
        clear(record); visibility?.unobserve(host); sizes?.unobserve(host); records.delete(host);
      }
    }
    for (const host of document.querySelectorAll(thumbnails)) {
      if (host.closest(navigation)) continue;
      if (!records.has(host)) {
        records.set(host, { offset: 0, visible: !visibility, animation: null });
        visibility?.observe(host); sizes?.observe(host);
      }
      records.get(host).height = host.getBoundingClientRect().height;
    }
  }
  function schedule() { if (!stopped && !scanFrame) scanFrame = requestAnimationFrame(scan); }
  const mutations = new MutationObserver(schedule);
  if (!isEditor()) {
    mutations.observe(document.documentElement, {
      childList: true, subtree: true, attributes: true, attributeFilter: ['href', 'class'],
    });
    window.addEventListener('scroll', scroll, { passive: true });
    window.addEventListener('resize', schedule);
    window.addEventListener('pageshow', reset);
    document.addEventListener('visibilitychange', reset);
    motion.addEventListener('change', reset);
    customElements.whenDefined('media-item').then(schedule);
    schedule();
  }
  function destroy() {
    stopped = true;
    reset(); cancelAnimationFrame(scanFrame);
    visibility?.disconnect(); sizes?.disconnect(); mutations.disconnect();
    window.removeEventListener('scroll', scroll);
    window.removeEventListener('resize', schedule);
    window.removeEventListener('pageshow', reset);
    document.removeEventListener('visibilitychange', reset);
    motion.removeEventListener('change', reset);
    records.clear();
  }
  return { get count() { return records.size; }, destroy };
}
