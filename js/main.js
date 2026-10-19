import { projects } from './projects.js';

// First release intentionally has no interactions. Activate modules only after
// GitHub Pages and Cargo loading have been verified on the published website.
window.danPortfolio = {
  ...window.danPortfolio,
  state: 'ready',
  phase: 'infrastructure',
  projectCount: projects.length,
  assetBase: new URL('../assets/', import.meta.url).href,
};
console.info('[Portfolio] Infrastructure ready', window.danPortfolio.release);
