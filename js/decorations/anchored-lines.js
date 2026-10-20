import {
  HOMEPAGE_ID, ENABLE_DECORATIVE_LINES, LINES_DESKTOP_MIN_WIDTH,
  INTRO_LINE_END_FRACTION, BACK_TOP_LINE_START_FRACTION, LINE_COLOR, LINE_STROKE_WIDTH,
} from '../config.js';

const svgNS = 'http://www.w3.org/2000/svg';
const owned = '.dan-home-lines';
const introSelector = '[data-dan-line-anchor="intro"]';
const endSelector = '[data-dan-line-anchor="back-to-top"], a[rel~="home-page"][href="#"]';
const scribbleSelector = '.projects-scribble dotlottie-wc';

export function lineGeometry(page, content, intro, scribble, back) {
  const relative = (x, y1, y2) => y2 > y1 ? {
    x: x - page.left, y1: y1 - page.top, y2: y2 - page.top,
  } : null;
  return {
    intro: intro ? relative(intro.right + (scribble?.width || 0) / 2,
      scribble?.bottom ?? intro.bottom,
      content.top + content.height * INTRO_LINE_END_FRACTION) : null,
    back: back ? relative(back.left - back.height / 2,
      content.top + content.height * BACK_TOP_LINE_START_FRACTION,
      back.top + back.height / 2) : null,
  };
}

export function mountAnchoredLines() {
  const desktop = matchMedia(`(min-width: ${LINES_DESKTOP_MIN_WIDTH}px)`);
  let frame = 0, stopped = false, page = null, overlay = null;
  let observed = new Set();
  const lines = new Map();
  function removeOverlay() {
    overlay?.remove(); overlay = null; lines.clear();
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
    const anchors = [intro, scribble, back];
    // Column sizes can move anchors even if the anchors keep their own sizes.
    watch([page, content, ...anchors, ...page.querySelectorAll('column-set, column-unit')]);
    const box = page.getBoundingClientRect(), body = content.getBoundingClientRect();
    const rect = node => {
      if (!node) return null;
      const r = node.getBoundingClientRect();
      return r.width && r.height ? r : null;
    };
    const geometry = lineGeometry(box, body, rect(intro), rect(scribble), rect(back));
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
  }
  function schedule() { if (!stopped && !frame) frame = requestAnimationFrame(measure); }
  function changed(records) {
    if (records.every(r => r.target.closest?.(owned))) return;
    // Ignore inline style churn from native media animations and Lottie canvases.
    // Only anchor/column/page geometry attributes need position remeasurement.
    if (records.some(r => r.type !== 'attributes' ||
        (page?.contains(r.target) && (
          r.target.matches?.('.page, .page-content, column-set, column-unit') ||
          r.target.matches?.(`${introSelector}, ${endSelector}, ${scribbleSelector}`) ||
          r.target.querySelector?.(`${introSelector}, ${endSelector}, ${scribbleSelector}`))))) schedule();
  }
  const mutations = new MutationObserver(changed);
  function loaded(event) { if (page?.contains(event.target)) schedule(); }
  if (ENABLE_DECORATIVE_LINES) {
    mutations.observe(document.documentElement, {
      childList: true, characterData: true, subtree: true, attributes: true,
      attributeFilter: ['style', 'class', 'span', 'slot', 'data-dan-line-anchor'],
    });
    desktop.addEventListener('change', schedule);
    window.addEventListener('resize', schedule);
    window.addEventListener('pageshow', schedule);
    document.addEventListener('load', loaded, true);
    document.fonts?.addEventListener('loadingdone', schedule);
    document.fonts?.ready.then(schedule);
    customElements.whenDefined('dotlottie-wc').then(schedule);
    schedule();
  }
  function destroy() {
    stopped = true; cancelAnimationFrame(frame);
    mutations.disconnect(); sizes?.disconnect(); observed.clear();
    desktop.removeEventListener('change', schedule);
    window.removeEventListener('resize', schedule);
    window.removeEventListener('pageshow', schedule);
    document.removeEventListener('load', loaded, true);
    document.fonts?.removeEventListener('loadingdone', schedule);
    removeOverlay();
  }
  return { get count() { return lines.size; }, destroy };
}
