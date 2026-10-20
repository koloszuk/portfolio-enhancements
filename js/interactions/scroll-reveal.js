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
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let frame = 0;
  let exitFrame = 0;
  let stopped = false;
  let observer;

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

  function resetAfterExit(host, record) {
    const box = host.getBoundingClientRect();
    const visual = host.shadowRoot?.querySelector('figure[part~="figure"]')
      ?.getBoundingClientRect() || box;
    const viewport = document.documentElement;
    const fullyOutside = Math.max(box.bottom, visual.bottom) <= 0 ||
      Math.min(box.top, visual.top) >= viewport.clientHeight ||
      Math.max(box.right, visual.right) <= 0 ||
      Math.min(box.left, visual.left) >= viewport.clientWidth;
    // The host may leave above the viewport while its downward-offset figure
    // is still visible. Wait for that last sliver rather than snapping it away.
    if (record.movement && !fullyOutside) return false;
    record.inside = false;
    record.pendingExit = false;
    cancel(record);
    host.setAttribute('data-dan-reveal', 'waiting');
    return true;
  }

  function checkPendingExits() {
    exitFrame = 0;
    if (stopped) return;
    if (isEditor()) { destroy(); return; }
    let pending = false;
    for (const [host, record] of records) {
      if (record.pendingExit && !resetAfterExit(host, record)) pending = true;
    }
    // Only poll during an active lift whose visual edge is still onscreen.
    if (pending) exitFrame = requestAnimationFrame(checkPendingExits);
  }

  function reveal(host, record) {
    if (motion.matches || isEditor()) {
      finish(host, record);
      return;
    }
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
      const record = {
        href: host.getAttribute('href'), animation: null, movement: null,
        inside: false, pendingExit: false,
      };
      records.set(host, record);
      if (!observer) {
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
          if (entry.isIntersecting) {
            // Edge contact counts as entry. Duplicate/partial intersections do
            // not restart the fade, even after its first animation has finished.
            record.pendingExit = false;
            if (!record.inside) {
              record.inside = true;
              reveal(entry.target, record);
            }
          } else if (record.inside) {
            record.pendingExit = true;
            if (!resetAfterExit(entry.target, record) && !exitFrame) {
              exitFrame = requestAnimationFrame(checkPendingExits);
            }
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
    cancelAnimationFrame(exitFrame);
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
