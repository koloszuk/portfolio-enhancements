import {
  HOMEPAGE_ID, ENABLE_DECORATIVE_LINES, LINES_DESKTOP_MIN_WIDTH,
  INTRO_LINE_TARGET_HREF, INTRO_LINE_TARGET_FRACTION,
  BACK_TOP_LINE_START_FRACTION, LINE_COLOR, LINE_STROKE_WIDTH,
} from '../config.js';

const svgNS = 'http://www.w3.org/2000/svg';
const owned = '.dan-home-lines';
const introSelector = '[data-dan-line-anchor="intro"]';
const endSelector = '[data-dan-line-anchor="back-to-top"], a[rel~="home-page"][href="#"]';
const scribbleSelector = '.projects-scribble dotlottie-wc';

export function introEndpoint(x, pageTop, target) {
  // Keep the entire stroke under the image. Never move the intro's X to chase it.
  const halfStroke = LINE_STROKE_WIDTH / 2;
  if (!target || x <= target.left + halfStroke || x >= target.right - halfStroke) return null;
  return target.top + target.height * INTRO_LINE_TARGET_FRACTION - pageTop;
}

export function lineGeometry(page, content, intro, scribble, back, target) {
  const relative = (x, y1, y2) => y2 > y1 ? {
    x: x - page.left, y1: y1 - page.top, y2: y2 - page.top,
  } : null;
  const x = intro ? intro.right + (scribble?.width || 0) / 2 : null;
  const end = intro ? introEndpoint(x, page.top, target) : null;
  return {
    intro: end !== null ? relative(x, scribble?.bottom ?? intro.bottom, end + page.top) : null,
    back: back ? relative(back.left - back.height / 2,
      content.top + content.height * BACK_TOP_LINE_START_FRACTION,
      back.top + back.height / 2) : null,
  };
}

export function mountAnchoredLines() {
  const desktop = matchMedia(`(min-width: ${LINES_DESKTOP_MIN_WIDTH}px)`);
  let frame = 0, endpointFrame = 0, stopped = false, page = null, overlay = null;
  let endpointState = null, missedTarget = false;
  let observed = new Set();
  const lines = new Map();
  function removeOverlay() {
    overlay?.remove(); overlay = null; lines.clear(); endpointState = null;
  }
  const sizes = 'ResizeObserver' in window ? new ResizeObserver(schedule) : null;
  function watch(elements) {
    const next = new Set(elements.filter(Boolean));
    for (const old of observed) if (!next.has(old)) sizes?.unobserve(old);
    for (const element of next) if (!observed.has(element)) sizes?.observe(element);
    observed = next;
  }
  function measure() {
    frame = 0;
    if (stopped) return;
    const home = document.getElementById(HOMEPAGE_ID);
    if (page !== home) { removeOverlay(); page = home; }
    if (!ENABLE_DECORATIVE_LINES || !desktop.matches || !page?.isConnected) {
      removeOverlay(); watch([]); return;
    }
    const content = page.querySelector('.page-content');
    if (!content) { removeOverlay(); return; }
    const intro = page.querySelector(introSelector);
    const scribble = page.querySelector(scribbleSelector);
    const back = page.querySelector('[data-dan-line-anchor="back-to-top"]') || page.querySelector(endSelector);
    const target = Array.from(page.querySelectorAll('gallery-freeform[thumbnail-index] media-item[href]'))
      .find(node => node.getAttribute('href') === INTRO_LINE_TARGET_HREF);
    const visual = target?.shadowRoot?.querySelector('figure[part~="figure"]');
    const anchors = [intro, scribble, back, target, target?.closest('gallery-freeform')];
    // Column sizes can move anchors even if the anchors keep their own sizes.
    watch([page, content, ...anchors, ...page.querySelectorAll('column-set, column-unit')]);
    const box = page.getBoundingClientRect(), body = content.getBoundingClientRect();
    const rect = node => {
      if (!node) return null;
      const r = node.getBoundingClientRect();
      return r.width && r.height ? r : null;
    };
    // The host carries Cargo's stable Freeform coordinates; only the inner
    // figure carries Fly in-out movement. Measure its actual rendered midpoint.
    const targetBox = rect(visual);
    const geometry = lineGeometry(box, body, rect(intro), rect(scribble), rect(back), targetBox);
    if (intro && targetBox && !geometry.intro && !missedTarget) {
      console.warn('[Portfolio] Intro line hidden: Logitech does not intersect the intro X, or is above its start. X unchanged.');
      missedTarget = true;
    } else if (geometry.intro) missedTarget = false;
    if (!box.width || !box.height) { removeOverlay(); return; }
    if (!overlay?.isConnected) {
      overlay = document.createElementNS(svgNS, 'svg');
      overlay.classList.add('dan-home-lines');
      overlay.setAttribute('aria-hidden', 'true');
      overlay.setAttribute('focusable', 'false');
      overlay.setAttribute('contenteditable', 'false');
      overlay.setAttribute('data-nosnippet', 'true');
      overlay.setAttribute('preserveAspectRatio', 'none');
      overlay.style.setProperty('--dan-line-color', LINE_COLOR);
      overlay.style.setProperty('--dan-line-width', String(LINE_STROKE_WIDTH));
      // Sibling of page-layout, never inside bodycopy/contenteditable or gallery.
      page.append(overlay);
      lines.clear();
    }
    overlay.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
    for (const [name, coordinates] of Object.entries(geometry)) {
      let line = lines.get(name);
      if (!coordinates) { line?.remove(); lines.delete(name); continue; }
      if (!line) {
        line = document.createElementNS(svgNS, 'line');
        line.setAttribute('data-line', name);
        overlay.append(line); lines.set(name, line);
      }
      line.setAttribute('x1', String(coordinates.x));
      line.setAttribute('x2', String(coordinates.x));
      line.setAttribute('y1', String(coordinates.y1));
      line.setAttribute('y2', String(coordinates.y2));
    }
    endpointState = geometry.intro && visual ? {
      visual, line: lines.get('intro'),
      pageTop: box.top + window.scrollY,
      x: geometry.intro.x + box.left + window.scrollX,
      start: geometry.intro.y1,
    } : null;
  }
  function updateEndpoint() {
    endpointFrame = 0;
    const state = endpointState;
    if (stopped || !desktop.matches || !state) return;
    if (!state.visual.isConnected || !state.line?.isConnected) { schedule(); return; }
    // One target rect per scroll frame, not a rescan of text/columns/gallery.
    // Read the visual, then remove document scrolling exactly once. The line's
    // origin, X and second line remain untouched; no native styles are written.
    const rect = state.visual.getBoundingClientRect();
    const end = introEndpoint(state.x - window.scrollX, state.pageTop - window.scrollY, rect);
    if (end === null || end <= state.start) { schedule(); return; }
    if (Math.abs(Number(state.line.getAttribute('y2')) - end) > 0.01) state.line.setAttribute('y2', String(end));
  }
  function scheduleEndpoint() {
    if (!stopped && endpointState && !endpointFrame) endpointFrame = requestAnimationFrame(updateEndpoint);
  }
  function schedule() { if (!stopped && !frame) frame = requestAnimationFrame(measure); }
  function changed(records) {
    if (records.every(r => r.target.closest?.(owned))) return;
    // Ignore inline style churn from native media animations and Lottie canvases.
    // Only anchor/column/page geometry attributes need position remeasurement.
    if (records.some(r => r.type !== 'attributes' ||
        (page?.contains(r.target) && (
          r.target.matches?.('.page, .page-content, column-set, column-unit, gallery-freeform, media-item[href]') ||
          r.target.matches?.(`${introSelector}, ${endSelector}, ${scribbleSelector}`) ||
          r.target.querySelector?.(`${introSelector}, ${endSelector}, ${scribbleSelector}`))))) schedule();
  }
  const mutations = new MutationObserver(changed);
  function loaded(event) { if (page?.contains(event.target)) schedule(); }
  if (ENABLE_DECORATIVE_LINES) {
    mutations.observe(document.documentElement, {
      childList: true, characterData: true, subtree: true, attributes: true,
      attributeFilter: ['style', 'class', 'span', 'slot', 'href', 'data-dan-line-anchor',
        'freeform-x', 'freeform-y', 'freeform-scale', 'thumbnail-index-metadata'],
    });
    desktop.addEventListener('change', schedule);
    window.addEventListener('resize', schedule);
    window.addEventListener('pageshow', schedule);
    window.addEventListener('scroll', scheduleEndpoint, { passive: true, capture: true });
    document.addEventListener('load', loaded, true);
    document.fonts?.addEventListener('loadingdone', schedule);
    document.fonts?.ready.then(schedule);
    customElements.whenDefined('dotlottie-wc').then(schedule);
    customElements.whenDefined('media-item').then(schedule);
    schedule();
  }
  function destroy() {
    stopped = true; cancelAnimationFrame(frame); cancelAnimationFrame(endpointFrame);
    mutations.disconnect(); sizes?.disconnect(); observed.clear();
    desktop.removeEventListener('change', schedule);
    window.removeEventListener('resize', schedule);
    window.removeEventListener('pageshow', schedule);
    window.removeEventListener('scroll', scheduleEndpoint, true);
    document.removeEventListener('load', loaded, true);
    document.fonts?.removeEventListener('loadingdone', schedule);
    removeOverlay();
  }
  return { get count() { return lines.size; }, destroy };
}
