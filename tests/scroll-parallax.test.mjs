import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../js/interactions/scroll-parallax.js', import.meta.url), 'utf8')
  .replaceAll('export ', '') + '\nthis.api={amplitudeForHeight,offsetForBox,safeAmplitudes,mountScrollParallax};';
function fixture({ reduced = false, editor = false, additive = true } = {}) {
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
  vm.runInNewContext(source, context);
  const mounted = context.api.mountScrollParallax();
  function step() { const batch = [...frames.values()]; frames.clear(); batch.forEach(fn => fn()); }
  step(); // ResizeObserver's initial callback may request one further frame in browsers.
  function scroll(y) { view.scrollY = y; view.dispatchEvent(new Event('scroll')); step(); }
  return { ...context.api, mounted, effects, scroll, step, frames, media, hosts, observers };
}
test('height-based traversal amplitudes range from 6 to 25px', () => {
  const f = fixture();
  assert.equal(f.amplitudeForHeight(60), 6);
  assert.equal(f.amplitudeForHeight(550), 25);
  assert.ok(f.amplitudeForHeight(300) > 6 && f.amplitudeForHeight(300) < 25);
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
test('viewport entry to exit traverses exactly the configured amplitude', () => {
  const f = fixture();
  assert.equal(f.offsetForBox({top:800,height:200},800,10),5);
  assert.equal(f.offsetForBox({top:-200,height:200},800,10),-5);
  assert.equal(f.offsetForBox({top:300,height:200},800,10),0);
});
test('collision budgets preserve gaps and intentional overlaps at every scroll position', () => {
  const f = fixture();
  function box(top, height=100, left=0) { return {top,bottom:top+height,height,left,right:left+100,gallery:1}; }
  for (const secondTop of [100,104,120,96,80]) {
    const boxes = [box(0),box(secondTop)];
    const amplitudes = f.safeAmplitudes(boxes);
    const separation = secondTop - 100;
    assert.ok((amplitudes[0]+amplitudes[1])/2 <= Math.abs(separation)*0.5 + 1e-9);
    for (let y=-900;y<500;y+=10) {
      const offsets=boxes.map((b,i)=>f.offsetForBox({...b,top:b.top-y},800,amplitudes[i]));
      const actualGap=secondTop+offsets[1]-(100+offsets[0]);
      if (separation>0) assert.ok(actualGap>=separation*0.5);
      else if (separation<0) assert.ok(actualGap<0);
      else assert.equal(actualGap,0);
    }
  }
  assert.equal(f.safeAmplitudes([box(0),box(100,100,200)])[0],6);
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
