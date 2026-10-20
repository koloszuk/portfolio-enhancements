// Deliberately separate from main.js: no interactive modules in Cargo's editor.
import { ENABLE_LINES_IN_EDITOR } from './config.js';
import { mountAnchoredLines } from './decorations/anchored-lines.js';

window.danPortfolio?.lines?.destroy();
const lines = ENABLE_LINES_IN_EDITOR ? mountAnchoredLines() : null;
window.danPortfolio = { ...window.danPortfolio, state: 'editor-decorations-ready', lines };
