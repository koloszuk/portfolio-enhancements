import { mountHomepageBackground } from './backgrounds/dot-grid.js';
import { projects } from './projects.js';
import { mountProjectHovers } from './interactions/project-hover.js';
import { mountScrollReveals } from './interactions/scroll-reveal.js';
import { mountScrollParallax } from './interactions/scroll-parallax.js';

// Set true to restore the existing directional fade/slide reveals.
const ENABLE_SCROLL_REVEAL = false;

window.danPortfolio?.hover?.destroy();
window.danPortfolio?.reveals?.destroy();
window.danPortfolio?.parallax?.destroy();
window.danPortfolio?.background?.destroy();
const background = mountHomepageBackground();
const hover = mountProjectHovers(projects);
const reveals = ENABLE_SCROLL_REVEAL ? mountScrollReveals() : null;
const parallax = mountScrollParallax();
window.danPortfolio = {
  ...window.danPortfolio,
  state: 'ready',
  phase: 'project-interactions',
  projectCount: projects.length,
  assetBase: new URL('../assets/', import.meta.url).href,
  hover,
  reveals,
  parallax,
  background,
};
console.info('[Portfolio] Project interactions ready', window.danPortfolio.release);
