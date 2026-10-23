function isEditor() {
  try {
    return /(?:^|\/)edit(?:\/|$)/.test(location.pathname) ||
      /(?:^|\/)edit(?:\/|$)/.test(window.top.location.pathname) ||
      !!document.querySelector('[contenteditable="true"]');
  } catch (_) { return true; }
}

// Local pattern copies are needed only above opaque Cargo backgrounds. Transparent
// surfaces show the shared site pattern; translucent surfaces keep Cargo's tint.
export function isOpaqueBackground(color) {
  if (!color || color === 'transparent') return false;
  if (/^#[\da-f]{4}$/i.test(color)) return color.slice(-1).toLowerCase() === 'f';
  if (/^#[\da-f]{8}$/i.test(color)) return color.slice(-2).toLowerCase() === 'ff';
  const alpha = color.match(/\/\s*([\d.]+)(%)?\s*\)$/);
  if (alpha) return Number(alpha[1]) >= (alpha[2] ? 100 : 1);
  const rgba = color.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)$/);
  return rgba ? Number(rgba[1]) >= 1 : true;
}

export function mountGlobalBackground() {
  const root = document.documentElement;
  const layers = new Map();
  let frame = 0, stopped = false;
  let canvasState = null;
  const previousColor = root.style.getPropertyValue('--dan-cargo-site-color');
  const previousPriority = root.style.getPropertyPriority('--dan-cargo-site-color');
  function scan() {
    frame = 0;
    if (stopped) return;
    if (isEditor()) { destroy(); return; }
    if (!document.body) return;
    attributes.disconnect();
    // Read Cargo's native root paint without our optional canvas additions.
    // Removing these attributes synchronously does not introduce a painted frame.
    root.removeAttribute('data-dan-canvas-color');
    root.removeAttribute('data-dan-canvas-pattern');
    const nativeRoot = getComputedStyle(root);
    const rootColor = nativeRoot.backgroundColor;
    const rootImage = nativeRoot.backgroundImage;
    const siteColor = nativeRoot.getPropertyValue('--site-background-color').trim();
    const bodyStyle = getComputedStyle(document.body);
    const color = bodyStyle.backgroundColor;
    const bodyImage = bodyStyle.backgroundImage;
    const noImages = rootImage === 'none' && bodyImage === 'none';
    const rootOpaque = isOpaqueBackground(rootColor);
    // Background images do not guarantee an opaque blend backdrop. Mirror only
    // a known opaque Cargo color, even with images; retain an opaque native root.
    const source = isOpaqueBackground(color) ? 'body' : isOpaqueBackground(siteColor) ? 'site' : null;
    const canvasColor = source === 'body' ? color : source === 'site' ? siteColor : '';
    const mirrorCanvas = !rootOpaque && !!source;
    if (!root.classList.contains('dan-global-background')) root.classList.add('dan-global-background');
    const settings = getComputedStyle(root);
    const experiment = ['1', 'true'].includes(settings.getPropertyValue('--ENABLE_FIXED_BACKPLANE_EXPERIMENT').trim());
    // A solid layer would cover native body/root wallpaper. Keep it transparent
    // in that case rather than replacing images or adding another workaround.
    const backplaneSource = isOpaqueBackground(color) ? 'body' : rootOpaque ? 'native-root' : source || 'transparent';
    const backplaneColor = noImages ? (isOpaqueBackground(color) ? color : rootOpaque ? rootColor : canvasColor || color) : 'transparent';
    const paintColor = experiment ? backplaneColor : canvasColor;
    if (root.style.getPropertyValue('--dan-cargo-site-color') !== paintColor) {
      if (paintColor) root.style.setProperty('--dan-cargo-site-color', paintColor);
      else root.style.removeProperty('--dan-cargo-site-color');
    }
    const enabled = ['1', 'true'].includes(settings.getPropertyValue('--ENABLE_BACKGROUND_PATTERN').trim());
    const type = settings.getPropertyValue('--PATTERN_TYPE').trim();
    const pattern = enabled && type === 'dots' ? 'dots' : 'none';
    if (root.getAttribute('data-dan-pattern') !== pattern) root.setAttribute('data-dan-pattern', pattern);
    const mode = experiment ? 'backplane' : 'canvas';
    if (root.getAttribute('data-dan-background-mode') !== mode) root.setAttribute('data-dan-background-mode', mode);
    // Mutually exclusive experiments: no root color/image additions underneath
    // the backplane. Disabling it restores the previous behavior for comparison.
    if (!experiment && mirrorCanvas) root.setAttribute('data-dan-canvas-color', source);
    if (!experiment && pattern === 'dots' && noImages && (rootOpaque || mirrorCanvas)) root.setAttribute('data-dan-canvas-pattern', 'dots');
    canvasState = { nativeRootColor: rootColor, bodyColor: color, siteColor,
      rootImage, bodyImage, source: rootOpaque ? 'native-root' : source || 'unavailable',
      mode, backplaneColor: experiment ? backplaneColor : null,
      backplaneSource: experiment ? (noImages ? backplaneSource : 'native-image-preserved') : null,
      backplaneOpaque: experiment && isOpaqueBackground(backplaneColor) };
    const surfaces = new Set(pattern === 'dots' || experiment ? [document.body] : []);
    const watched = [root, document.body];
    for (const page of document.querySelectorAll('.page')) {
      // Never paint the transparent Difference-blended pinned Header/Footer.
      if (page.matches('.pinned, .fixed, .overlay, #I0367072328, #S2531296503')) continue;
      for (const surface of [page, ...page.querySelectorAll('.page-content')]) {
        watched.push(surface);
        if (pattern === 'dots' && isOpaqueBackground(getComputedStyle(surface).backgroundColor)) surfaces.add(surface);
      }
    }
    for (const [surface, layer] of layers) {
      if (!surfaces.has(surface) || !surface.isConnected || !layer.isConnected) {
        layer.remove(); layers.delete(surface);
      }
    }
    for (const surface of surfaces) {
      if (layers.has(surface)) continue;
      const layer = document.createElement('div');
      layer.className = surface === document.body ? 'dan-site-pattern' : 'dan-surface-pattern';
      layer.setAttribute('aria-hidden', 'true');
      surface.prepend(layer);
      layers.set(surface, layer);
    }
    attributes.disconnect();
    for (const surface of watched) attributes.observe(surface, { attributes: true, attributeFilter: ['class', 'style'] });
  }
  function schedule() { if (!stopped && !frame) frame = requestAnimationFrame(scan); }
  const mutations = new MutationObserver(schedule);
  const attributes = new MutationObserver(schedule);
  const stylesheetLoaded = event => {
    if (event.target?.matches?.('link[rel="stylesheet"], style')) schedule();
  };
  if (!isEditor()) {
    // No scroll listener, layout measurement, new isolation, or perpetual loop.
    mutations.observe(root, { childList: true, subtree: true, characterData: true });
    window.addEventListener('resize', schedule, { passive: true });
    document.addEventListener('load', stylesheetLoaded, true);
    schedule();
  }
  function destroy() {
    stopped = true;
    cancelAnimationFrame(frame);
    mutations.disconnect(); attributes.disconnect();
    window.removeEventListener('resize', schedule);
    document.removeEventListener('load', stylesheetLoaded, true);
    for (const layer of layers.values()) layer.remove();
    layers.clear();
    root.classList.remove('dan-global-background');
    root.removeAttribute('data-dan-pattern');
    root.removeAttribute('data-dan-canvas-color');
    root.removeAttribute('data-dan-canvas-pattern');
    root.removeAttribute('data-dan-background-mode');
    if (previousColor) root.style.setProperty('--dan-cargo-site-color', previousColor, previousPriority);
    else root.style.removeProperty('--dan-cargo-site-color');
  }
  return {
    destroy,
    // On-demand diagnostics only: computed opacity does not prove compositor behavior.
    get canvas() {
      const rootColor = getComputedStyle(root).backgroundColor;
      return { ...canvasState, rootColor, rootOpaque: isOpaqueBackground(rootColor) };
    },
  };
}
