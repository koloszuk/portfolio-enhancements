import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const config = readFileSync(new URL('../js/config.js', import.meta.url), 'utf8').replaceAll('export ', '');
const source = readFileSync(new URL('../js/interactions/scroll-parallax.js', import.meta.url), 'utf8')
  .replace(/import \{[\s\S]*?\} from '..\/config.js';/, '')
  .replaceAll('export ', '') + '\nthis.api={motionProfile,offsetAtPosition,offsetForBox,mountScrollParallax};';
function fixture({ reduced = false, editor = false, additive = true, enabled = true, intensity = 1, width = 0.5 } = {}) {
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
  vm.runInNewContext(config.replace('ENABLE_PARALLAX = true', `ENABLE_PARALLAX = ${enabled}`).replace('PARALLAX_INTENSITY = 1', `PARALLAX_INTENSITY = ${intensity}`).replace('PARALLAX_SLOW_ZONE_WIDTH = 0.5', `PARALLAX_SLOW_ZONE_WIDTH = ${width}`) + source, context);
  const mounted = context.api.mountScrollParallax();
  function step() { const batch = [...frames.values()]; frames.clear(); batch.forEach(fn => fn()); }
  step(); // ResizeObserver's initial callback may request one further frame in browsers.
  function scroll(y) { view.scrollY = y; view.dispatchEvent(new Event('scroll')); step(); }
  return { ...context.api, mounted, effects, scroll, step, frames, media, hosts, observers, doc };
}
function speed(f, x, viewport=800) {
  const d=0.01;
  return 1+(f.offsetAtPosition(x+d,viewport)-f.offsetAtPosition(x-d,viewport))/(2*d);
}
test('rendered derivative follows the symmetric 1.6 / 1.0 / 0.4 / 1.0 / 1.6 profile', () => {
  const f=fixture();
  for (const [x,expected] of [[-400,1.6],[-200,1],[0,.4],[200,1],[400,1.6]]) {
    assert.ok(Math.abs(speed(f,x)-expected)<1e-6);
  }
});
test('mapping is monotonic, symmetric and bounded, including smooth outer joins', () => {
  const f=fixture();
  for (const viewport of [320,800,1400]) {
    const {range,radius,tail}=f.motionProfile(viewport);
    let previous=-Infinity;
    for(let x=-viewport*2;x<=viewport*2;x+=2) {
      const offset=f.offsetAtPosition(x,viewport), visual=x+offset;
      assert.ok(visual>previous); previous=visual;
      assert.ok(Math.abs(offset)<=range);
      assert.ok(Math.abs(offset+f.offsetAtPosition(-x,viewport))<1e-8);
      assert.ok(speed(f,x,viewport)>0);
    }
    for (const join of [radius,radius+tail]) {
      assert.ok(Math.abs(speed(f,join-.01,viewport)-speed(f,join+.01,viewport))<.0001);
    }
    assert.ok(Math.abs(speed(f,viewport*2,viewport)-1)<1e-8);
  }
});
test('scroll positions retrace exactly and stops schedule no settling frames', () => {
  const f=fixture(); f.scroll(100);
  const at100=f.effects.map(a=>a.currentTime);
  assert.equal(f.frames.size,0); f.step();
  assert.deepEqual(f.effects.map(a=>a.currentTime),at100);
  const range=f.motionProfile(800).range;
  const before=f.hosts.map((h,i)=>{const b=h.getBoundingClientRect();return b.top+b.height/2+(2*at100[i]-1)*range;});
  f.scroll(500);
  f.hosts.forEach((h,i)=>{const b=h.getBoundingClientRect();assert.ok(b.top+b.height/2+(2*f.effects[i].currentTime-1)*range<before[i]);});
  f.scroll(100); assert.deepEqual(f.effects.map(a=>a.currentTime),at100);
  assert.ok(f.effects.every(a=>a.options.composite==='add'&&a.options.easing==='linear'));
  f.mounted.destroy(); assert.ok(f.effects.every(a=>a.cancelled));
});
test('each thumbnail responds to its own native center, independent of height at equal centers', () => {
  const f=fixture();
  assert.equal(f.offsetForBox({top:300,height:200},800),0);
  assert.equal(f.offsetForBox({top:350,height:100},800),0);
  assert.notEqual(f.offsetForBox({top:0,height:100},800),f.offsetForBox({top:300,height:100},800));
});
test('toggle and zero intensity restore native composition; strength and width are configurable', () => {
  const off=fixture({enabled:false}); off.scroll(300); assert.equal(off.effects.length,0);
  const zero=fixture({intensity:0}); zero.scroll(300); assert.equal(zero.effects.length,0);
  const half=fixture({intensity:.5}); assert.ok(Math.abs(speed(half,0)-.7)<1e-6);
  assert.ok(Math.abs(speed(half,400)-1.3)<1e-6);
  const narrow=fixture({width:.25}); assert.ok(Math.abs(speed(narrow,200)-1.6)<1e-6);
  const strong=fixture({intensity:3}); assert.ok(speed(strong,0)>0);
});
test('resizing replaces the bounded additive range without stale effects', () => {
  const f=fixture(); const old=[...f.effects];
  f.doc.documentElement.clientHeight=1200; f.observers[0].callback(); f.step();
  assert.ok(old.every(a=>a.cancelled)); assert.equal(f.effects.length,4);
  const range=f.motionProfile(1200).range;
  assert.equal(f.effects[2].keyframes[0].transform,`translateY(${-range}px)`);
  assert.equal(f.frames.size,0);
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
