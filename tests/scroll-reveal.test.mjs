import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../js/interactions/scroll-reveal.js', import.meta.url), 'utf8')
  .replace('export const revealOptions', 'const revealOptions')
  .replace('export function mountScrollReveals', 'function mountScrollReveals') +
  '\nthis.mount = mountScrollReveals;';

function fixture({ editor = false, reduced = false, supported = true } = {}) {
  const page = {};
  const queue = [];
  const observers = [];
  const mutations = [];
  const media = new EventTarget();
  media.matches = reduced;
  function host(href) {
    const attrs = new Map([['href', href], ['freeform-x', '37'], ['style', 'transform: native']]);
    return {
      attrs, animations: [], isConnected: true,
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
  }
  const hosts = [host('#nothing'), host('#other')];
  class IO {
    constructor(callback, options) { this.callback = callback; this.options = options; this.observed = new Set(); observers.push(this); }
    observe(el) { this.observed.add(el); }
    unobserve(el) { this.observed.delete(el); }
    disconnect() { this.observed.clear(); }
    enter(el, bottom = 100) {
      this.callback([{ target: el, isIntersecting: true,
        intersectionRect: { width: 100, height: 1 }, boundingClientRect: { bottom } }]);
    }
    passed(el) {
      this.callback([{ target: el, isIntersecting: false,
        intersectionRect: { width: 0, height: 0 }, boundingClientRect: { bottom: -20 } }]);
    }
  }
  const context = {
    console, location: { pathname: editor ? '/edit/home' : '/' },
    window: { top: { location: { pathname: editor ? '/edit/home' : '/' } },
      ...(supported ? { IntersectionObserver: IO } : {}) },
    document: { documentElement: {}, querySelector: () => null,
      querySelectorAll(selector) {
        assert.equal(selector, 'gallery-freeform[thumbnail-index] media-item[href]');
        return hosts.filter(h => h.isConnected);
      } },
    IntersectionObserver: IO,
    MutationObserver: class { constructor(callback) { this.callback = callback; mutations.push(this); } observe() {} disconnect() {} },
    matchMedia: () => media,
    requestAnimationFrame: callback => { queue.push(callback); return queue.length; },
    cancelAnimationFrame() {},
    customElements: { whenDefined: () => new Promise(() => {}) },
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  const api = context.mount();
  const flush = () => { while (queue.length) queue.shift()(); };
  flush();
  return { hosts, host, api, io: observers[0], media, flush,
    mutate: () => { mutations[0].callback(); flush(); } };
}

test('individual reveals run once, animate opacity only, and leave Cargo styles intact', async () => {
  const f = fixture(), [a, b] = f.hosts;
  assert.equal(a.getAttribute('data-dan-reveal'), 'waiting');
  assert.equal(a.getAttribute('style'), 'transform: native');
  f.io.enter(a);
  assert.equal(b.animations.length, 0);
  const animation = a.animations[0];
  assert.equal(JSON.stringify(animation.frames), '[{"opacity":0},{"opacity":1}]');
  assert.equal(animation.options.duration, 700);
  assert.equal(animation.options.fill, 'none');
  assert.equal(a.getAttribute('freeform-x'), '37');
  animation.complete();
  await Promise.resolve();
  f.io.enter(a);
  assert.equal(a.animations.length, 1);
  assert.equal(a.getAttribute('data-dan-reveal'), 'revealed');
  f.api.destroy();
});

test('restored scroll and fast jumps skip passed thumbnails without hiding them', () => {
  const f = fixture(), [a] = f.hosts;
  f.io.passed(a);
  f.io.enter(a);
  assert.equal(a.animations.length, 0);
  assert.equal(a.getAttribute('style'), 'transform: native');
  f.api.destroy();
});

test('new projects are observed; rebuilt thumbnails retain their visit history', () => {
  const f = fixture(), [a] = f.hosts;
  f.io.enter(a);
  a.isConnected = false;
  const replacement = f.host('#nothing'), added = f.host('#new-project');
  f.hosts.push(replacement, added);
  f.mutate();
  assert.equal(replacement.getAttribute('data-dan-reveal'), 'revealed');
  assert.equal(replacement.animations.length, 0);
  assert.equal(f.io.observed.has(added), true);
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
