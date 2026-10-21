import {
  HOMEPAGE_ID, ENABLE_PROJECT_SCALE, PROJECT_SCALE_HOVER, PROJECT_SCALE_OTHERS,
  PROJECT_SCALE_NORMAL, PROJECT_SCALE_DURATION, PROJECT_SCALE_EASING,
} from '../config.js';

const thumbnails = 'gallery-freeform[thumbnail-index] media-item[href]';
function isEditor() {
  try {
    return /(?:^|\/)edit(?:\/|$)/.test(location.pathname) ||
      /(?:^|\/)edit(?:\/|$)/.test(window.top.location.pathname) ||
      !!document.querySelector('[contenteditable="true"]');
  } catch (_) { return true; }
}
export function mountProjectScale() {
  const records = new Map();
  const capable = matchMedia('(min-width: 901px) and (hover: hover) and (pointer: fine)');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let page = null, restorePage = null, active = null, frame = 0, leaveFrame = 0, stopped = false;
  const eligible = () => ENABLE_PROJECT_SCALE && capable.matches && !motion.matches && !isEditor();
  function variables(node, values) {
    const previous = Object.keys(values).map(key => [key, node.style.getPropertyValue(key), node.style.getPropertyPriority(key)]);
    for (const [key,value] of Object.entries(values)) node.style.setProperty(key, value);
    return () => {
      for (const [key,value,priority] of previous) {
        if (value) node.style.setProperty(key,value,priority); else node.style.removeProperty(key);
      }
    };
  }
  function setActive(host) {
    cancelAnimationFrame(leaveFrame); leaveFrame = 0;
    if (host && (!eligible() || !records.has(host))) host = null;
    if (active === host) return;
    active = host;
    for (const item of records.keys()) item.setAttribute('data-dan-scale-state',
      !active ? 'normal' : item === active ? 'active' : 'other');
  }
  function reset() { setActive(null); }
  function leave() {
    cancelAnimationFrame(leaveFrame);
    leaveFrame = requestAnimationFrame(() => { leaveFrame = 0; reset(); });
  }
  function transition(element, pseudo) {
    const value = getComputedStyle(element, pseudo).transition;
    return !value || value === 'none' ? 'opacity 0s' : value;
  }
  function attach(host, link, media) {
    const restore = variables(host, {
      '--dan-scale-media-base': transition(media),
      '--dan-scale-tint-base': transition(host, '::after'),
      '--dan-scale-caption-base': host.querySelector('.caption') ? transition(host.querySelector('.caption')) : 'opacity 0s',
    });
    const enter = event => { if (event.pointerType === 'mouse' && eligible()) setActive(host); };
    link.addEventListener('pointerenter', enter);
    link.addEventListener('pointerleave', leave);
    link.addEventListener('pointercancel', reset);
    records.set(host, {
      link, media,
      destroy() {
        link.removeEventListener('pointerenter', enter);
        link.removeEventListener('pointerleave', leave);
        link.removeEventListener('pointercancel', reset);
        host.removeAttribute('data-dan-scale'); host.removeAttribute('data-dan-scale-state'); restore();
      },
    });
    host.setAttribute('data-dan-scale', '');
    host.setAttribute('data-dan-scale-state', active ? 'other' : 'normal');
  }
  function scan() {
    frame = 0;
    if (stopped) return;
    const home = eligible() ? document.getElementById(HOMEPAGE_ID) : null;
    if (home !== page) {
      reset();
      for (const record of records.values()) record.destroy(); records.clear();
      restorePage?.(); restorePage = null; page = home;
      if (page) restorePage = variables(page, {
        '--dan-scale-hover': String(PROJECT_SCALE_HOVER), '--dan-scale-others': String(PROJECT_SCALE_OTHERS),
        '--dan-scale-normal': String(PROJECT_SCALE_NORMAL), '--dan-scale-duration': `${PROJECT_SCALE_DURATION}ms`,
        '--dan-scale-easing': PROJECT_SCALE_EASING,
      });
    }
    for (const [host,record] of records) {
      if (!host.isConnected || !page?.contains(host) || !host.matches(thumbnails) ||
          !record.link.isConnected || !record.media.isConnected) {
        if (host === active) reset();
        record.destroy(); records.delete(host);
      }
    }
    if (!page) return;
    for (const host of page.querySelectorAll(thumbnails)) {
      if (records.has(host)) continue;
      const link = host.shadowRoot?.querySelector('a[part~="link"]');
      const media = host.shadowRoot?.querySelector('img[part~="media"]');
      // Preserve a future Cargo individual scale rather than overriding it.
      if (link && media && getComputedStyle(media).scale === 'none') attach(host, link, media);
    }
  }
  function schedule() { if (!stopped && !frame) frame = requestAnimationFrame(scan); }
  function preferenceChanged() { reset(); scan(); }
  function pointerDown(event) { if (event.pointerType !== 'mouse') reset(); }
  const changes = new MutationObserver(schedule);
  if (!isEditor() && ENABLE_PROJECT_SCALE) {
    changes.observe(document.documentElement, {
      subtree: true, childList: true, attributes: true, attributeFilter: ['href', 'class'],
    });
    capable.addEventListener('change', preferenceChanged); motion.addEventListener('change', preferenceChanged);
    window.addEventListener('blur', reset);
    document.addEventListener('visibilitychange', reset);
    document.addEventListener('pointerdown', pointerDown, { passive: true });
    customElements.whenDefined('media-item').then(schedule);
    schedule();
  }
  function destroy() {
    stopped = true; reset(); cancelAnimationFrame(frame); cancelAnimationFrame(leaveFrame);
    changes.disconnect();
    capable.removeEventListener('change', preferenceChanged); motion.removeEventListener('change', preferenceChanged);
    window.removeEventListener('blur', reset); document.removeEventListener('visibilitychange', reset);
    document.removeEventListener('pointerdown', pointerDown);
    for (const record of records.values()) record.destroy(); records.clear(); restorePage?.();
  }
  return { get count() { return records.size; }, destroy };
}
