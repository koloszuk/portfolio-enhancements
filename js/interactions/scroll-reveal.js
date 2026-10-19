const thumbnails = 'gallery-freeform[thumbnail-index] media-item[href]';
const navigation = '.page.pinned, nav, header, [role="navigation"]';
export const revealOptions = Object.freeze({
  duration: 1000,
  easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
});

function isEditor() {
  try {
    return /(?:^|\/)edit(?:\/|$)/.test(location.pathname) ||
      /(?:^|\/)edit(?:\/|$)/.test(window.top.location.pathname) ||
      !!document.querySelector('[contenteditable="true"]');
  } catch (_) { return true; }
}

export function mountScrollReveals() {
  const records = new Map();
  const visits = new WeakMap();
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let frame = 0;
  let stopped = false;
  let observer;

  function identity(host) {
    const page = host.closest('.page') || host.closest('gallery-freeform') ||
      document.documentElement;
    if (!visits.has(page)) visits.set(page, new Set());
    return { seen: visits.get(page), key: host.getAttribute('href') };
  }

  function cancel(record) {
    const animations = [record.animation, record.movement];
    record.animation = null;
    record.movement = null;
    for (const animation of animations) animation?.cancel();
  }

  function finish(host, record) {
    cancel(record);
    host.setAttribute('data-dan-reveal', 'revealed');
  }

  function reveal(host, record) {
    observer?.unobserve(host);
    const { seen, key } = identity(host);
    if (seen.has(key) || motion.matches || isEditor()) {
      seen.add(key);
      finish(host, record);
      return;
    }
    seen.add(key);
    try {
      // Fade the whole item (including its native hover decoration), but move
      // only Cargo's internal visual figure. Percentages use the figure's own
      // height, which matches the thumbnail; Cargo's host transform is untouched.
      const animation = host.animate([{ opacity: 0 }, { opacity: 1 }], {
        ...revealOptions,
        fill: 'none',
      });
      record.animation = animation;
      const figure = host.shadowRoot?.querySelector('figure[part~="figure"]');
      // Individual translate composes with transform. If Cargo starts using
      // translate itself, preserve it and retain the safe opacity-only fallback.
      if (figure && getComputedStyle(figure).translate === 'none') {
        try {
          record.movement = figure.animate([
            { translate: '0 10%' },
            { translate: '0 0%' },
          ], { ...revealOptions, fill: 'none' });
        } catch (_) { /* Older browsers retain the fade without movement. */ }
      }
      const start = document.timeline?.currentTime;
      if (typeof start === 'number') {
        animation.startTime = start;
        if (record.movement) record.movement.startTime = start;
      }
      host.setAttribute('data-dan-reveal', 'revealing');
      const completed = [animation.finished];
      if (record.movement) completed.push(record.movement.finished);
      Promise.all(completed).then(() => {
        if (record.animation === animation) finish(host, record);
      }, () => {
        if (record.animation === animation) finish(host, record);
      });
    } catch (_) { finish(host, record); }
  }

  function scan() {
    frame = 0;
    if (stopped) return;
    if (isEditor()) { destroy(); return; }
    for (const [host, record] of records) {
      if (!host.isConnected || !host.matches(thumbnails) || host.closest(navigation) ||
          record.href !== host.getAttribute('href')) {
        observer?.unobserve(host);
        cancel(record);
        host.removeAttribute('data-dan-reveal');
        records.delete(host);
      }
    }
    for (const host of document.querySelectorAll(thumbnails)) {
      if (records.has(host) || host.closest(navigation)) continue;
      const record = { href: host.getAttribute('href'), animation: null, movement: null };
      records.set(host, record);
      const { seen, key } = identity(host);
      if (motion.matches || seen.has(key) || !observer) {
        seen.add(key);
        finish(host, record);
      } else {
        // Waiting items are visible by default, including when scrolling is
        // restored midway down the page or callbacks are delayed by a busy tab.
        host.setAttribute('data-dan-reveal', 'waiting');
        observer.observe(host);
      }
    }
  }

  function schedule() {
    if (!stopped && !frame) frame = requestAnimationFrame(scan);
  }

  function motionChanged() {
    if (motion.matches) {
      for (const [host, record] of records) {
        observer?.unobserve(host);
        const { seen, key } = identity(host);
        seen.add(key);
        finish(host, record);
      }
    }
    schedule();
  }

  const mutations = new MutationObserver(schedule);
  if (!isEditor()) {
    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver(entries => {
        if (isEditor()) { destroy(); return; }
        for (const entry of entries) {
          const record = records.get(entry.target);
          if (!record || !entry.target.isConnected) continue;
          if (entry.isIntersecting && entry.intersectionRect.width > 0 &&
              entry.intersectionRect.height > 0) {
            reveal(entry.target, record);
          } else if (entry.boundingClientRect.bottom <= 0) {
            // Already passed on restored scroll / large scroll jumps: don't
            // flash these items again when the visitor scrolls back upward.
            const { seen, key } = identity(entry.target);
            seen.add(key);
            observer.unobserve(entry.target);
            finish(entry.target, record);
          }
        }
      }, { threshold: 0, rootMargin: '0px' });
    }
    mutations.observe(document.documentElement, {
      childList: true, subtree: true, attributes: true, attributeFilter: ['href', 'class'],
    });
    motion.addEventListener('change', motionChanged);
    customElements.whenDefined('media-item').then(schedule);
    schedule();
  }

  function destroy() {
    stopped = true;
    cancelAnimationFrame(frame);
    observer?.disconnect();
    mutations.disconnect();
    motion.removeEventListener('change', motionChanged);
    for (const [host, record] of records) {
      cancel(record);
      host.removeAttribute('data-dan-reveal');
    }
    records.clear();
  }

  return { get count() { return records.size; }, destroy };
}
