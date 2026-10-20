import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const config = readFileSync(new URL('../js/config.js', import.meta.url), 'utf8').replaceAll('export ', '');
const source = readFileSync(new URL('../js/interactions/scroll-parallax.js', import.meta.url), 'utf8')
  .replace(/import \{[\s\S]*?\} from '..\/config.js';/, '')
  .replaceAll('export ', '') + '\nthis.api={maxOffsetForHeight,offsetForBox,mountScrollParallax};';
function fixture({ reduced = false, editor = false, additive = true, enabled = true, intensity = 1 } = {}) {
  let id = 0;
  const frames = new Map(), effects = [], observers = [];
  const media = Object.assign(new EventTarget(), { matches: reduced });
  const view = Object.assign(new EventTarget(), { scrollY: 0, top: { location: { pathname: '/' } } });
  const gallery = {};
  function host(height, left) {
    const figure = { animate(keyframes, options) {
      const effect = { effect: { composite: additive ? options.composite : 'replace' },
        keyframes, options, pause() {}, cancel() { this.cancelled = true; } };
      effects.push(effect); return effect;
    } };
    return { isConnected: true, figure,
      shadowRoot: { querySelector: () => figure },
      closest: selector => selector === 'gallery-freeform' ? gallery : null,
      getBoundingClientRect: () => ({ top: 400 - view.scrollY, bottom: 400 + height - view.scrollY,
        height, left, right: left + 100 }),
    };
  }
  const hosts = [host(100, 0), host(550, 200)];
  const doc = Object.assign(new EventTarget(), { hidden: false,
    documentElement: { clientHeight: 800 },
    querySelector: () => null, querySelectorAll: () => hosts.filter(h => h.isConnected),
  });
  class Resize { constructor(callback) { this.callback = callback; observers.push(this); } observe() {} unobserve() {} disconnect() {} }
  const context = { window: Object.assign(view, { ResizeObserver: Resize }), document: doc,
    location: { pathname: editor ? '/edit/x' : '/' }, matchMedia: () => media,
    ResizeObserver: Resize, MutationObserver: class { observe() {} disconnect() {} },
    customElements: { whenDefined: () => new Promise(() => {}) },
    requestAnimationFrame: fn => { frames.set(++id, fn); return id; },
    cancelAnimationFrame: id => frames.delete(id),
  };
  vm.runInNewContext(config.replace('ENABLE_PARALLAX = true', `ENABLE_PARALLAX = ${enabled}`).replace('PARALLAX_INTENSITY = 1', `PARALLAX_INTENSITY = ${intensity}`) + source, context);
  const mounted = context.api.mountScrollParallax();
  function step() { const batch = [...frames.values()]; frames.clear(); batch.forEach(fn => fn()); }
  step(); // ResizeObserver's initial callback may request one further frame in browsers.
  function scroll(y) { view.scrollY = y; view.dispatchEvent(new Event('scroll')); step(); }
  return { ...context.api, mounted, effects, scroll, step, frames, media, hosts, observers };
}
test('peak offsets vary continuously from 25px small through 67px medium to 120px tall', () => {
  const f = fixture();
  assert.equal(f.maxOffsetForHeight(60), 25);
  assert.equal(f.maxOffsetForHeight(550), 120);
  assert.ok(Math.abs(f.maxOffsetForHeight(300) - 67.2222222222) < 0.0001);
  assert.ok(f.maxOffsetForHeight(500) > 100);
});
test('scroll position is deterministic, reversible and has no settling frames', () => {
  const f = fixture(); f.scroll(100);
  const at100 = f.effects.map(a => a.currentTime);
  assert.equal(f.frames.size, 0);
  f.step(); assert.deepEqual(f.effects.map(a => a.currentTime), at100);
  f.scroll(500); assert.ok(f.effects.every((a,i) => a.currentTime < at100[i]));
  f.scroll(100); assert.deepEqual(f.effects.map(a => a.currentTime), at100);
  assert.ok(f.effects.every(a => a.options.composite === 'add' && a.options.easing === 'linear'));
  assert.equal(f.effects.length, 2);
  f.mounted.destroy(); assert.ok(f.effects.every(a => a.cancelled));
});
test('entry/exit offsets use the full peak, not half of it', () => {
  const f = fixture();
  assert.equal(f.offsetForBox({top:800,height:200},800,25),25);
  assert.equal(f.offsetForBox({top:-200,height:200},800,25),-25);
  assert.equal(f.offsetForBox({top:300,height:200},800,25),0);
});
test('calibration preserves strong size differences without a shared spacing cap', () => {
  const f=fixture(); f.scroll(0);
  const offsets=f.effects.map(a=>a.currentTime*240-120);
  // At equal top positions, the tall thumbnail has a much stronger response.
  assert.ok(Math.abs(offsets[1]) > Math.abs(offsets[0])*8);
});
test('configuration disables effects and scales their range without clipping', () => {
  const off=fixture({enabled:false}); off.scroll(300); assert.equal(off.effects.length,0);
  const double=fixture({intensity:2});
  assert.equal(double.maxOffsetForHeight(550),240);
  assert.equal(double.effects[0].keyframes[0].transform,'translateY(-240px)');
});
test('reduced motion, editor and unsupported additive effects stay safe', () => {
  const f = fixture(); f.media.matches=true; f.media.dispatchEvent(new Event('change')); f.step();
  assert.ok(f.effects.every(a=>a.cancelled)); const n=f.effects.length;
  f.scroll(300); assert.equal(f.effects.length,n);
  f.media.matches=false; f.media.dispatchEvent(new Event('change')); f.step();
  assert.equal(f.effects.length,n+2);
  const editor=fixture({editor:true}); editor.scroll(300); assert.equal(editor.effects.length,0);
  const legacy=fixture({additive:false}); assert.ok(legacy.effects.every(a=>a.cancelled));
});
test('removed and newly added projects clean up and initialize without idle loops', () => {
  const f=fixture(); f.hosts[0].isConnected=false; f.scroll(200);
  assert.equal(f.mounted.count,1); assert.ok(f.effects[0].cancelled);
  f.hosts[0].isConnected=true; f.scroll(300); assert.equal(f.mounted.count,2);
  assert.equal(f.frames.size,0);
});
