import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../js/interactions/scroll-reveal.js', import.meta.url), 'utf8')
  .replace('export const revealOptions', 'const revealOptions')
  .replace('export function mountScrollReveals', 'function mountScrollReveals') +
  '\nthis.mount = mountScrollReveals;';

function fixture({ editor = false, reduced = false, supported = true, scrollY = 0 } = {}) {
  const page = {};
  const queue = [];
  const observers = [];
  const mutations = [];
  const media = new EventTarget();
  media.matches = reduced;
  function host(href) {
    const attrs = new Map([['href', href], ['freeform-x', '37'], ['style', 'transform: native']]);
    const item = {
      attrs, animations: [], isConnected: true,
      rect: { top: 0, bottom: 100, left: 0, right: 100, width: 100, height: 100 },
      getBoundingClientRect() { return this.rect; },
      getAttribute: key => attrs.get(key) ?? null,
      setAttribute: (key, value) => attrs.set(key, value),
      removeAttribute: key => attrs.delete(key),
      closest(selector) { return selector.includes('.page.pinned') ? (this.pinned ? page : null) : page; },
      matches: selector => selector === 'gallery-freeform[thumbnail-index] media-item[href]',
      animate(frames, options) {
        if (this.fail) throw Error('Animation API unavailable');
        let resolve, reject;
        const animation = {
          frames, options, cancelled: false,
          finished: new Promise((yes, no) => { resolve = yes; reject = no; }),
          complete: () => resolve(),
          cancel() { this.cancelled = true; reject(Error('cancelled')); },
        };
        this.animations.push(animation);
        return animation;
      },
    };
    const figure = {
      animations: [], animate: item.animate, translate: 'none', offset: 0,
      getBoundingClientRect() {
        return { ...item.rect, top: item.rect.top + this.offset,
          bottom: item.rect.bottom + this.offset };
      },
    };
    item.figure = figure;
    item.shadowRoot = { querySelector(selector) {
      assert.equal(selector, 'figure[part~="figure"]');
      return item.figure;
    } };
    return item;
  }
  const hosts = [host('#nothing'), host('#other')];
  class IO {
    constructor(callback, options) { this.callback = callback; this.options = options; this.observed = new Set(); observers.push(this); }
    observe(el) { this.observed.add(el); }
    unobserve(el) { this.observed.delete(el); }
    disconnect() { this.observed.clear(); }
    enter(el, bottom = 100) {
      el.rect = { ...el.rect, top: bottom - 100, bottom };
      this.callback([{ target: el, isIntersecting: true,
        intersectionRect: { width: 100, height: 1 }, boundingClientRect: { bottom } }]);
    }
    passed(el) {
      el.rect = { ...el.rect, top: -120, bottom: -20 };
      this.callback([{ target: el, isIntersecting: false,
        intersectionRect: { width: 0, height: 0 }, boundingClientRect: { bottom: -20 } }]);
    }
    below(el) {
      el.rect = { ...el.rect, top: 820, bottom: 920 };
      this.callback([{ target: el, isIntersecting: false,
        intersectionRect: { width: 0, height: 0 }, boundingClientRect: el.rect }]);
    }
    edge(el) {
      this.callback([{ target: el, isIntersecting: true,
        intersectionRect: { width: 100, height: 0 }, boundingClientRect: el.rect }]);
    }
  }
  const view = Object.assign(new EventTarget(), {
    scrollY, top: { location: { pathname: editor ? '/edit/home' : '/' } },
    ...(supported ? { IntersectionObserver: IO } : {}),
  });
  const context = {
    console, location: { pathname: editor ? '/edit/home' : '/' },
    window: view,
    document: { timeline: { currentTime: 1234 },
      documentElement: { clientHeight: 800, clientWidth: 1200, scrollHeight: 5000 }, querySelector: () => null,
      querySelectorAll(selector) {
        assert.equal(selector, 'gallery-freeform[thumbnail-index] media-item[href]');
        return hosts.filter(h => h.isConnected);
      } },
    IntersectionObserver: IO,
    MutationObserver: class { constructor(callback) { this.callback = callback; mutations.push(this); } observe() {} disconnect() {} },
    matchMedia: () => media,
    getComputedStyle: element => ({ translate: element.translate }),
    requestAnimationFrame: callback => { queue.push(callback); return queue.length; },
    cancelAnimationFrame() {},
    customElements: { whenDefined: () => new Promise(() => {}) },
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  const api = context.mount();
  const flush = () => { for (const callback of queue.splice(0)) callback(); };
  flush();
  return { hosts, host, api, io: observers[0], media, flush,
    scroll(y, notify = true) { view.scrollY = y; if (notify) view.dispatchEvent(new Event('scroll')); },
    pageshow() { view.dispatchEvent(new Event('pageshow')); },
    mutate: () => { mutations[0].callback(); flush(); } };
}

test('individual reveals synchronize a 1000 ms fade with 10% internal movement and preserve Cargo transforms', async () => {
  const f = fixture(), [a, b] = f.hosts;
  assert.equal(a.getAttribute('data-dan-reveal'), 'waiting');
  assert.equal(a.getAttribute('style'), 'transform: native');
  f.io.enter(a);
  assert.equal(b.animations.length, 0);
  const animation = a.animations[0];
  assert.equal(JSON.stringify(animation.frames), '[{"opacity":0},{"opacity":1}]');
  assert.equal(animation.options.duration, 1000);
  assert.equal(animation.options.easing, 'cubic-bezier(0.22, 1, 0.36, 1)');
  assert.equal(animation.options.fill, 'none');
  const movement = a.figure.animations[0];
  assert.equal(JSON.stringify(movement.frames), '[{"translate":"0 10%"},{"translate":"0 0%"}]');
  assert.deepEqual(movement.options, animation.options);
  assert.equal(movement.startTime, animation.startTime);
  assert.equal(animation.startTime, 1234);
  assert.equal(a.getAttribute('freeform-x'), '37');
  animation.complete();
  movement.complete();
  // Drain both the test and VM promise queues (Promise.all spans the realms).
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(a.getAttribute('data-dan-reveal'), 'revealed');
  f.io.enter(a);
  assert.equal(a.animations.length, 1);
  assert.equal(a.getAttribute('data-dan-reveal'), 'revealed');
  f.api.destroy();
});

test('direction is captured at entry and never reverses an active reveal', () => {
  const f = fixture(), [a] = f.hosts;
  f.scroll(400);
  f.io.enter(a);
  assert.equal(a.figure.animations[0].frames[0].translate, '0 10%');
  f.scroll(300);
  f.io.enter(a);
  assert.equal(a.figure.animations.length, 1);
  assert.equal(a.figure.animations[0].frames[0].translate, '0 10%');
  f.io.passed(a);
  f.io.enter(a);
  assert.equal(a.figure.animations[1].frames[0].translate, '0 -10%');
  f.scroll(500);
  f.io.below(a);
  f.io.enter(a);
  assert.equal(a.figure.animations[2].frames[0].translate, '0 10%');
  f.api.destroy();
});

test('IO samples direction even when its callback arrives before the scroll event', () => {
  const f = fixture({ scrollY: 700 }), [a] = f.hosts;
  f.scroll(500, false);
  f.io.enter(a);
  assert.equal(a.figure.animations[0].frames[0].translate, '0 -10%');
  f.api.destroy();
});

test('restored loading defaults down; subpixel jitter and elastic overscroll do not flip direction', () => {
  const f = fixture({ scrollY: 500 }), [a] = f.hosts;
  f.io.enter(a);
  assert.equal(a.figure.animations[0].frames[0].translate, '0 10%');
  f.io.passed(a);
  f.scroll(499.8);
  f.io.enter(a);
  assert.equal(a.figure.animations[1].frames[0].translate, '0 10%');
  f.io.passed(a);
  f.scroll(0);
  f.scroll(-30);
  f.scroll(0);
  f.io.enter(a);
  assert.equal(a.figure.animations[2].frames[0].translate, '0 -10%');
  f.io.passed(a);
  f.pageshow();
  f.io.enter(a);
  assert.equal(a.figure.animations[3].frames[0].translate, '0 10%');
  f.api.destroy();
});

test('upward entries also wait for an above-offset visual edge to fully leave', () => {
  const f = fixture({ scrollY: 500 }), [a] = f.hosts;
  f.scroll(400);
  f.io.enter(a);
  assert.equal(a.figure.animations[0].frames[0].translate, '0 -10%');
  a.figure.offset = -30;
  f.io.below(a); // Native top 820, visual top 790 remains visible.
  f.flush();
  assert.equal(a.animations[0].cancelled, false);
  f.io.enter(a);
  assert.equal(a.animations.length, 1);
  f.io.below(a);
  a.figure.offset = 0;
  f.flush();
  assert.equal(a.getAttribute('data-dan-reveal'), 'waiting');
  f.api.destroy();
});

test('down/up/down entries replay only after full exit and stay observed', () => {
  const f = fixture(), [a] = f.hosts;
  f.io.enter(a);
  assert.equal(a.animations.length, 1);
  f.io.passed(a);
  assert.equal(a.getAttribute('data-dan-reveal'), 'waiting');
  assert.equal(a.animations[0].cancelled, true);
  assert.equal(a.figure.animations[0].cancelled, true);
  assert.equal(f.io.observed.has(a), true);
  f.io.enter(a);
  assert.equal(a.animations.length, 2);
  f.io.below(a);
  f.io.enter(a);
  assert.equal(a.animations.length, 3);
  assert.equal(a.figure.animations.length, 3);
  assert.equal(a.getAttribute('style'), 'transform: native');
  f.api.destroy();
});

test('offscreen initialization and partial intersections never hide or repeatedly reset an item', async () => {
  const f = fixture(), [a] = f.hosts;
  f.io.below(a);
  assert.equal(a.animations.length, 0);
  assert.equal(a.getAttribute('style'), 'transform: native');
  f.io.edge(a);
  f.io.enter(a);
  f.io.edge(a);
  assert.equal(a.animations.length, 1);
  assert.equal(a.animations[0].cancelled, false);
  a.animations[0].complete();
  a.figure.animations[0].complete();
  await new Promise(resolve => setImmediate(resolve));
  f.io.enter(a);
  f.io.edge(a);
  assert.equal(a.animations.length, 1);
  assert.equal(a.getAttribute('data-dan-reveal'), 'revealed');
  f.api.destroy();
});

test('rapid full exits/re-entries do not let old animation promises reset the new reveal', async () => {
  const f = fixture(), [a] = f.hosts;
  for (let i = 0; i < 4; i++) {
    f.io.enter(a);
    f.io.passed(a);
  }
  f.io.enter(a);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(a.animations.length, 5);
  assert.equal(a.animations[4].cancelled, false);
  assert.equal(a.getAttribute('data-dan-reveal'), 'revealing');
  f.api.destroy();
});

test('a moving visual edge remains visible until it too has fully exited', () => {
  const f = fixture(), [a] = f.hosts;
  f.io.enter(a);
  a.figure.offset = 30;
  f.io.passed(a); // Native box ends at -20, visual edge still reaches +10.
  f.flush();
  assert.equal(a.animations[0].cancelled, false);
  f.io.enter(a);
  assert.equal(a.animations.length, 1);
  f.io.passed(a);
  a.figure.offset = 0;
  f.flush();
  assert.equal(a.animations[0].cancelled, true);
  assert.equal(a.getAttribute('data-dan-reveal'), 'waiting');
  f.io.enter(a);
  assert.equal(a.animations.length, 2);
  f.api.destroy();
});

test('new and rebuilt projects are observed and reveal independently', () => {
  const f = fixture(), [a] = f.hosts;
  f.io.enter(a);
  a.isConnected = false;
  const replacement = f.host('#nothing'), added = f.host('#new-project');
  f.hosts.push(replacement, added);
  f.mutate();
  assert.equal(replacement.getAttribute('data-dan-reveal'), 'waiting');
  assert.equal(replacement.animations.length, 0);
  assert.equal(f.io.observed.has(added), true);
  assert.equal(f.io.observed.has(replacement), true);
  f.io.enter(replacement);
  assert.equal(replacement.animations.length, 1);
  f.api.destroy();
});

test('editor, reduced motion, and unavailable observer all leave thumbnails visible', () => {
  for (const options of [{ editor: true }, { reduced: true }, { supported: false }]) {
    const f = fixture(options);
    assert.equal(f.hosts[0].animations.length, 0);
    assert.equal(f.hosts[0].getAttribute('style'), 'transform: native');
    f.api.destroy();
  }
});

test('reduced-motion changes and teardown cancel running reveals without stale attributes', async () => {
  const f = fixture(), [a] = f.hosts;
  f.io.enter(a);
  f.media.matches = true;
  f.media.dispatchEvent(new Event('change'));
  assert.equal(a.animations[0].cancelled, true);
  assert.equal(a.figure.animations[0].cancelled, true);
  assert.equal(f.io.observed.has(a), true);
  f.media.matches = false;
  f.media.dispatchEvent(new Event('change'));
  f.io.passed(a);
  f.io.enter(a);
  assert.equal(a.animations.length, 2);
  f.api.destroy();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(a.getAttribute('data-dan-reveal'), null);
});

test('animation failure leaves the native image visible', () => {
  const f = fixture(), [a] = f.hosts;
  a.fail = true;
  f.io.enter(a);
  assert.equal(a.getAttribute('data-dan-reveal'), 'revealed');
  assert.equal(a.getAttribute('style'), 'transform: native');
  f.api.destroy();
});

test('existing native figure translate is preserved, with an opacity-only fallback', () => {
  const f = fixture(), [a] = f.hosts;
  a.figure.translate = '0px 5px';
  f.io.enter(a);
  assert.equal(a.animations.length, 1);
  assert.equal(a.figure.animations.length, 0);
  assert.equal(a.figure.translate, '0px 5px');
  f.api.destroy();
});

test('missing or unsupported internal wrappers keep the fade and never move media-item', () => {
  for (const mode of ['missing', 'unsupported']) {
    const f = fixture(), [a] = f.hosts;
    if (mode === 'missing') a.figure = null;
    else a.figure.fail = true;
    f.io.enter(a);
    assert.equal(a.animations.length, 1);
    assert.equal(JSON.stringify(a.animations[0].frames), '[{"opacity":0},{"opacity":1}]');
    assert.equal(a.getAttribute('style'), 'transform: native');
    f.api.destroy();
  }
});

test('pinned navigation thumbnails are excluded even after Cargo changes their class', () => {
  const f = fixture(), [a] = f.hosts;
  a.pinned = true;
  f.mutate();
  assert.equal(a.getAttribute('data-dan-reveal'), null);
  assert.equal(f.io.observed.has(a), false);
  const pinned = f.host('#navigation');
  pinned.pinned = true;
  f.hosts.push(pinned);
  f.mutate();
  assert.equal(pinned.getAttribute('data-dan-reveal'), null);
  f.api.destroy();
});
