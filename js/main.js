import { projects } from './projects.js';
import { mountProjectHovers } from './interactions/project-hover.js';

window.danPortfolio?.hover?.destroy();
const hover = mountProjectHovers(projects);
window.danPortfolio = {
  ...window.danPortfolio,
  state: 'ready',
  phase: 'project-hover',
  projectCount: projects.length,
  assetBase: new URL('../assets/', import.meta.url).href,
  hover,
};
console.info('[Portfolio] Project hover ready', window.danPortfolio.release);
