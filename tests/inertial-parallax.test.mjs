import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../js/interactions/inertial-parallax.js', import.meta.url), 'utf8')
  .replaceAll('export ', '') + '\nthis.api={heightWeight,approach,mountInertialParallax};';
function fixture({ reduced = false, editor = false, additive = true } = {}) {
  let time = 100, id = 0;
  const frames = new Map(), effects = [];
  const media = Object.assign(new EventTarget(), { matches: reduced });
  const view = Object.assign(new EventTarget(), { scrollY: 100, top: { location: { pathname: '/' } } });
  const figure = { animate(keyframes, options) {
    const effect = { effect: { composite: additive ? options.composite : 'replace' },
      keyframes, options, pause() {}, cancel() { this.cancelled = true; } };
    effects.push(effect); return effect;
  } };
  const hosts = [200, 550].map(height => ({ isConnected: true,
    shadowRoot: { querySelector: () => figure }, closest: () => null,
    matches: () => true, getBoundingClientRect: () => ({ height }),
  }));
  const doc = Object.assign(new EventTarget(), { hidden: false,
    documentElement: { clientHeight: 800, scrollHeight: 5000 },
    querySelector: () => null, querySelectorAll: () => hosts,
  });
  const context = { window: view, document: doc, location: { pathname: editor ? '/edit/x' : '/' },
    performance: { now: () => time }, matchMedia: () => media,
    MutationObserver: class { observe() {} disconnect() {} },
    customElements: { whenDefined: () => new Promise(() => {}) },
    requestAnimationFrame: fn => { frames.set(++id, fn); return id; },
    cancelAnimationFrame: id => frames.delete(id),
  };
  vm.runInNewContext(source, context);
  const mounted = context.api.mountInertialParallax();
  function step() { time += 16; const batch = [...frames.values()]; frames.clear(); batch.forEach(fn => fn(time)); }
  step();
  function scroll(delta) { time += 16; view.scrollY += delta; view.dispatchEvent(new Event('scroll')); step(); }
  return { ...context.api, mounted, effects, scroll, step, frames, media, hosts };
}
test('height scaling is monotonic and bounded', () => {
  const f = fixture();
  assert.ok(f.heightWeight(100) < f.heightWeight(300));
  assert.equal(f.heightWeight(10000), 1);
  assert.ok(f.heightWeight(0) > 0);
});
test('directions, per-height intensity, cap, additive composition and complete settling', () => {
  const f = fixture(); f.scroll(60);
  assert.equal(f.effects.length, 2);
  const offsets = f.effects.map(a => a.currentTime * 24 - 12);
  assert.ok(offsets[0] < 0 && offsets[1] < offsets[0]);
  assert.ok(offsets.every(x => Math.abs(x) <= 12));
  assert.ok(f.effects.every(a => a.options.composite === 'add'));
  for (let i = 0; i < 120; i++) f.step();
  assert.ok(f.effects.every(a => a.cancelled)); assert.equal(f.frames.size, 0);
  f.scroll(-60);
  assert.ok(f.effects.slice(-2).every(a => a.currentTime > 0.5));
  f.mounted.destroy(); assert.ok(f.effects.every(a => a.cancelled));
});
test('reduced motion cancels existing effects and disables further motion', () => {
  const f = fixture(); f.scroll(50); f.media.matches = true;
  f.media.dispatchEvent(new Event('change'));
  assert.ok(f.effects.every(a => a.cancelled));
  const count = f.effects.length; f.scroll(50); assert.equal(f.effects.length, count);
});
test('editor stays inactive; unsupported additive animation safely cancels', () => {
  const editor = fixture({ editor: true }); editor.scroll(50);
  assert.equal(editor.mounted.count, 0); assert.equal(editor.effects.length, 0);
  const legacy = fixture({ additive: false }); legacy.scroll(50);
  assert.ok(legacy.effects.every(a => a.cancelled));
});
