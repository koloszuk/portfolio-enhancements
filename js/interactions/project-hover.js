const assetBase = new URL('../../assets/', import.meta.url);
const styleURL = new URL('../../css/interactions/project-hover.css', import.meta.url);

function isEditor() {
  try {
    return /(?:^|\/)edit(?:\/|$)/.test(location.pathname) ||
      /(?:^|\/)edit(?:\/|$)/.test(window.top.location.pathname) ||
      !!document.querySelector('[contenteditable="true"]');
  } catch (_) { return true; }
}

export function mountProjectHovers(projects) {
  const mounted = new Map();
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const pointer = matchMedia('(hover: hover) and (pointer: fine)');
  let stopped = false;
  let frame = 0;
  const matches = host => projects.find(project =>
    host.getAttribute('href') === project.href);

  function attach(host, project) {
    const root = host.shadowRoot;
    const link = root?.querySelector('a[part~="link"]');
    const original = link?.querySelector('slot[name="custom-media"] > img');
    // Never replace an existing custom-media slot or guess at Cargo markup.
    if (!link || !original || host.querySelector('[slot="custom-media"]')) return;
    const originalLabel = link.getAttribute('aria-label');
    if (!originalLabel) link.setAttribute('aria-label', project.title);
    const style = document.createElement('link');
    style.rel = 'stylesheet';
    style.href = styleURL.href;
    const layer = document.createElement('span');
    layer.className = 'dan-hover-layer';
    layer.hidden = true;
    layer.setAttribute('aria-hidden', 'true');
    const animation = document.createElement('img');
    animation.className = 'dan-hover-animation';
    animation.alt = '';
    animation.decoding = 'async';
    animation.draggable = false;
    const tint = document.createElement('span');
    tint.className = 'dan-hover-tint';
    const title = document.createElement('span');
    title.className = 'dan-hover-title';
    title.textContent = project.title;
    layer.append(animation, tint, title);
    let styled = false;
    let hovering = false;
    let focused = false;
    let resetTimer = 0;
    const events = new AbortController();
    const options = { signal: events.signal };
    const wantsAnimation = () => (hovering || focused) && !motion.matches && !isEditor();
    function update() {
      clearTimeout(resetTimer);
      const wanted = wantsAnimation();
      if (wanted && !animation.hasAttribute('src')) {
        animation.src = new URL(project.animation, assetBase).href;
      }
      const active = wanted && styled && animation.complete && animation.naturalWidth > 0;
      host.toggleAttribute('data-dan-hover-active', active);
      if (!wanted) {
        // Stop decoding the hidden GIF once the fade back to Cargo completes.
        resetTimer = setTimeout(() => animation.removeAttribute('src'), 220);
      }
    }
    animation.addEventListener('load', update, options);
    animation.addEventListener('error', () => {
      host.removeAttribute('data-dan-hover-active');
      if (!animation.hasAttribute('src')) return;
      console.warn('[Portfolio] Hover image unavailable; retaining Cargo thumbnail', project.href);
    }, options);
    link.addEventListener('pointerenter', event => {
      if (event.pointerType !== 'mouse' || !pointer.matches) return;
      hovering = true;
      update();
    }, options);
    link.addEventListener('pointerleave', () => { hovering = false; update(); }, options);
    link.addEventListener('focusin', () => {
      focused = link.matches(':focus-visible');
      update();
    }, options);
    link.addEventListener('focusout', () => { focused = false; update(); }, options);
    style.addEventListener('load', () => {
      styled = true;
      host.setAttribute('data-dan-hover', project.pageId);
      layer.hidden = false;
      update();
    }, options);
    style.addEventListener('error', () => {
      console.warn('[Portfolio] Hover styles unavailable; retaining Cargo behavior');
    }, options);
    const shadowObserver = new MutationObserver(() => {
      // Cargo may recreate its shadow content during navigation or resizing.
      if (!link.isConnected || !layer.isConnected || !style.isConnected) schedule();
    });
    root.append(style);
    link.append(layer);
    shadowObserver.observe(root, { childList: true, subtree: true });
    mounted.set(host, {
      valid: () => link.isConnected && layer.isConnected && style.isConnected,
      destroy() {
        shadowObserver.disconnect();
        events.abort();
        clearTimeout(resetTimer);
        animation.removeAttribute('src');
        host.removeAttribute('data-dan-hover-active');
        host.removeAttribute('data-dan-hover');
        if (!originalLabel && link.getAttribute('aria-label') === project.title) {
          if (originalLabel === null) link.removeAttribute('aria-label');
          else link.setAttribute('aria-label', originalLabel);
        }
        layer.remove();
        style.remove();
      },
    });
  }

  function scan() {
    frame = 0;
    if (stopped) return;
    const disabled = isEditor() || motion.matches;
    for (const [host, record] of mounted) {
      if (disabled || !host.isConnected || !record.valid() || !matches(host)) {
        record.destroy();
        mounted.delete(host);
      }
    }
    if (disabled) return;
    for (const host of document.querySelectorAll('gallery-freeform[thumbnail-index] media-item[href]')) {
      const project = matches(host);
      if (project && !mounted.has(host)) attach(host, project);
    }
  }
  function schedule() {
    if (!stopped && !frame) frame = requestAnimationFrame(scan);
  }
  const observer = new MutationObserver(schedule);
  if (!isEditor()) {
    observer.observe(document.documentElement, {
      childList: true, subtree: true, attributes: true, attributeFilter: ['href'],
    });
    motion.addEventListener('change', schedule);
    customElements.whenDefined('media-item').then(schedule);
    schedule();
  }
  return {
    get count() { return mounted.size; },
    destroy() {
      stopped = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      motion.removeEventListener('change', schedule);
      for (const record of mounted.values()) record.destroy();
      mounted.clear();
    },
  };
}
