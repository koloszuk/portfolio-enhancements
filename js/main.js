import { projects } from './projects.js';
import { mountProjectHovers } from './interactions/project-hover.js';
import { mountScrollReveals } from './interactions/scroll-reveal.js';
import { mountInertialParallax } from './interactions/inertial-parallax.js';

window.danPortfolio?.hover?.destroy();
window.danPortfolio?.reveals?.destroy();
window.danPortfolio?.parallax?.destroy();
const hover = mountProjectHovers(projects);
const reveals = mountScrollReveals();
const parallax = mountInertialParallax();
window.danPortfolio = {
  ...window.danPortfolio,
  state: 'ready',
  phase: 'project-interactions',
  projectCount: projects.length,
  assetBase: new URL('../assets/', import.meta.url).href,
  hover,
  reveals,
  parallax,
};
console.info('[Portfolio] Project interactions ready', window.danPortfolio.release);
