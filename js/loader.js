/* Stable one-time Cargo entry point. No layout rules or framework required. */
(() => {
  'use strict';
  if (window.__danPortfolioLoader) return;
  function isEditor() {
    try {
      return /(?:^|\/)edit(?:\/|$)/.test(location.pathname) ||
        /(?:^|\/)edit(?:\/|$)/.test(window.top.location.pathname) ||
        !!document.querySelector('[contenteditable="true"]');
    } catch (_) {
      // Unknown embedding context: keep Cargo editing safe.
      return true;
    }
  }
  if (isEditor()) return;
  const source = document.currentScript;
  if (!source || !source.src) return;
  window.__danPortfolioLoader = true;
  const base = new URL('./', source.src);
  const status = window.danPortfolio = { state: 'loading', release: null };
  const manifest = new URL('release.json', base);
  manifest.searchParams.set('t', Date.now());
  fetch(manifest, { cache: 'no-store', credentials: 'omit' })
    .then(response => {
      if (!response.ok) throw new Error(`Release manifest: ${response.status}`);
      return response.json();
    })
    .then(async ({ release }) => {
      if (!/^[a-f0-9]{12}$/.test(release)) throw new Error('Invalid release');
      if (isEditor()) return;
      status.release = release;
      const releaseBase = new URL(`releases/${release}/`, base);
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = new URL('css/main.css', releaseBase).href;
      await new Promise((resolve, reject) => {
        css.onload = resolve;
        css.onerror = () => reject(new Error('Stylesheet failed to load'));
        document.head.append(css);
      });
      if (isEditor()) { css.remove(); return; }
      const app = document.createElement('script');
      app.type = 'module';
      app.src = new URL('js/main.js', releaseBase).href;
      app.onerror = () => { status.state = 'error'; console.warn('[Portfolio] Module failed to load'); };
      document.head.append(app);
    })
    .catch(error => {
      status.state = 'error';
      console.warn('[Portfolio] External code unavailable; Cargo remains usable.', error);
    });
})();
