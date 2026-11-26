import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const source = app.slice(app.indexOf('  let imageViewerRequest = 0;'), app.indexOf('  async function closeDialog('));

function fixture({ motion = true, fine = true, deferred = false } = {}) {
  const elements = new Map(), images = [], animations = [], stage = [];
  let now = 0, nextTimer = 1;
  const timers = new Map(), classes = new Set();
  class Element {
    constructor() { this.attributes = {}; this.hidden = false; }
    set id(value) { this.attributes.id = value; elements.set(`#${value}`, this); }
    get id() { return this.attributes.id; }
    removeAttribute(name) { if (name === 'id') elements.delete(`#${this.id}`); delete this.attributes[name]; }
    setAttribute(name, value) { this.attributes[name] = value; }
    remove() { const i = stage.indexOf(this); if (i >= 0) stage.splice(i, 1); }
    after(image) { image.remove(); stage.splice(stage.indexOf(this) + 1, 0, image); }
    replaceWith(image) { this.after(image); this.remove(); }
    animate(keys, timing) {
      let finish;
      const animation = { keys, timing, finished: new Promise(resolve => { finish = resolve; }), cancel() { finish(); }, finish() { finish(); } };
      animations.push(animation);
      return animation;
    }
  }
  const dialog = { open: false, classList: {
    toggle(name, active) { if (active) classes.add(name); else classes.delete(name); },
    add(name) { classes.add(name); }, remove(name) { classes.delete(name); }, contains: name => classes.has(name)
  }, showModal() { this.open = true; } };
  for (const id of ['lightbox-caption', 'lightbox-note', 'lightbox-tags', 'lightbox-previous', 'lightbox-next']) elements.set(`#${id}`, new Element());
  const original = new Element(); original.id = 'lightbox-image'; stage.push(original);
  elements.set('#lightbox', dialog);
  const items = ['a', 'b', 'c', 'd', 'e'].map(src => ({
    dataset: { image: src, imageAlt: `Photo ${src}`, imageCaption: src },
    isConnected: true, closest: () => ({})
  }));
  elements.set('#photo-roll', { firstElementChild: { querySelectorAll: () => items } });
  const scope = vm.createContext({
    $: selector => elements.get(selector), state: { motion }, closingDialogs: new WeakSet(),
    escape: value => value, resetProjectScroll() {}, queuePointerMotion() {},
    window: { matchMedia: query => ({ matches: query.includes('pointer: coarse') ? !fine : fine }) },
    performance: { now: () => now },
    setTimeout(fn, delay) { const id = nextTimer++; timers.set(id, { fn, at: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    Image: class extends Element {
      constructor() { super(); images.push(this); this.decodes = 0; }
      decode() {
        this.decodes++;
        return deferred ? new Promise((resolve, reject) => { this.finishDecode = resolve; this.failDecode = reject; }) : Promise.resolve();
      }
    }
  });
  vm.runInContext(source + '\nglobalThis.viewer = { openImage, stepImage, clearImageTransition, wakeImageControls, resetImageControlsIdle, get cacheSize() { return viewerImageCache.size; } };', scope);
  return { viewer: scope.viewer, items, elements, stage, images, animations, dialog, timers,
    tick(time) {
      now = time;
      for (const [id, timer] of [...timers]) {
        if (timer.at <= now) { timers.delete(id); timer.fn(); }
      }
    },
    async flush() { for (let i = 0; i < 12; i++) await Promise.resolve(); },
    async finish() { animations.forEach(animation => animation.finish()); await this.flush(); }
  };
}

test('Photo navigation slides both images with ease-in-out and reuses decoded neighbors', async () => {
  const view = fixture();
  await view.viewer.openImage(view.items[0]);
  await view.flush();
  assert.equal(view.images.length, 3, 'only current and two neighbors load initially');
  const neighbor = view.images.find(image => image.src === 'b');
  view.viewer.stepImage(1);
  await view.flush();
  assert.equal(view.elements.get('#lightbox-image'), neighbor);
  assert.equal(neighbor.decodes, 1, 'navigation reuses the decoded image');
  assert.equal(view.stage.length, 2, 'outgoing image remains during the slide');
  assert.equal(view.animations.length, 2);
  assert.equal(view.animations[0].keys[1].transform, 'translateX(-100%)');
  assert.equal(view.animations[1].keys[0].transform, 'translateX(100%)');
  assert.equal(view.animations[1].timing.easing, 'ease-in-out');
  await view.finish();
  assert.equal(view.stage.length, 1, 'outgoing image is removed after the slide');
  assert.equal(view.viewer.cacheSize, 3);
});

test('Rapid navigation queues a direction and keeps at most two images on stage', async () => {
  const view = fixture();
  await view.viewer.openImage(view.items[0]);
  view.viewer.stepImage(1); await view.flush();
  view.viewer.stepImage(-1); view.viewer.stepImage(-1);
  assert.equal(view.animations.length, 2, 'no overlapping transitions');
  await view.finish();
  assert.equal(view.elements.get('#lightbox-image').src, 'a');
  assert.equal(view.animations.at(-1).keys[0].transform, 'translateX(-100%)');
  assert.equal(view.stage.length, 2);
  await view.finish();
  assert.equal(view.stage.length, 1);
});

test('Reduced motion swaps immediately and cleanup removes an unfinished outgoing image', async () => {
  const reduced = fixture({ motion: false });
  await reduced.viewer.openImage(reduced.items[0]);
  reduced.viewer.stepImage(1); await reduced.flush();
  assert.equal(reduced.animations.length, 0);
  assert.equal(reduced.stage.length, 1);
  const view = fixture();
  await view.viewer.openImage(view.items[0]);
  view.viewer.stepImage(1); await view.flush();
  view.viewer.clearImageTransition(); await view.flush();
  assert.equal(view.stage.length, 1);
});

test('A stale decode never replaces the most recently requested photo', async () => {
  const view = fixture();
  const first = view.viewer.openImage(view.items[0]);
  const last = view.viewer.openImage(view.items[2]);
  await Promise.all([first, last]);
  assert.equal(view.elements.get('#lightbox-image').src, 'c');
  assert.equal(view.elements.get('#lightbox-caption').textContent, 'c');
});

test('Carousel arrows hide after two seconds of inactivity and wake on mouse movement', async () => {
  const view = fixture();
  await view.viewer.openImage(view.items[0]);
  view.tick(1999);
  assert.equal(view.dialog.classList.contains('is-controls-idle'), false);
  view.tick(2000);
  assert.equal(view.dialog.classList.contains('is-controls-idle'), true);
  assert.equal(view.timers.size, 0);
  view.viewer.wakeImageControls({ type: 'pointermove', pointerType: 'mouse', clientX: 100, clientY: 100 });
  assert.equal(view.dialog.classList.contains('is-controls-idle'), false);
  view.tick(3000);
  view.viewer.wakeImageControls({ type: 'pointermove', pointerType: 'mouse', clientX: 110, clientY: 100 });
  view.tick(4000);
  assert.equal(view.dialog.classList.contains('is-controls-idle'), false, 'movement postpones the old deadline');
  assert.equal(view.timers.size, 1);
  view.tick(5000);
  assert.equal(view.dialog.classList.contains('is-controls-idle'), true);
});

test('Keyboard or touch restores controls and cleanup cancels their idle timer', async () => {
  const view = fixture();
  await view.viewer.openImage(view.items[0]);
  view.tick(2000);
  view.viewer.wakeImageControls();
  assert.equal(view.dialog.classList.contains('is-controls-idle'), false);
  view.tick(4000);
  view.viewer.wakeImageControls({ pointerType: 'touch' });
  assert.equal(view.dialog.classList.contains('is-controls-idle'), false);
  assert.equal(view.timers.size, 0, 'touch leaves controls available');
  view.viewer.wakeImageControls();
  view.viewer.resetImageControlsIdle();
  assert.equal(view.timers.size, 0);
  view.tick(6000);
  assert.equal(view.dialog.classList.contains('is-controls-idle'), false);
});

test('Touch-only viewers keep their arrows visible without an idle timer', async () => {
  const view = fixture({ fine: false });
  await view.viewer.openImage(view.items[0]);
  view.tick(30000);
  assert.equal(view.dialog.classList.contains('is-controls-idle'), false);
  assert.equal(view.timers.size, 0);
});

test('A phone tap opens the preview immediately and only decodes phone-sized images', async () => {
  const view = fixture({ fine: false, deferred: true });
  for (const item of view.items) item.dataset.imagePreview = `preview-${item.dataset.image}`;
  const opening = view.viewer.openImage(view.items[0]);
  assert.equal(view.dialog.open, true, 'opening must not wait for a network request or decode');
  assert.equal(view.elements.get('#lightbox-image').src, 'preview-a');
  assert.equal(view.elements.get('#lightbox-caption').textContent, 'a');
  assert.equal(view.images[0].src, 'preview-a');
  // Infinite scrolling can remove the tapped duplicate while loading.
  view.items[0].isConnected = false;
  view.images[0].finishDecode();
  await opening;
  assert.equal(view.elements.get('#lightbox-image'), view.images[0]);
  assert.deepEqual(view.images.map(image => image.src).sort(), ['preview-a', 'preview-b', 'preview-e']);
  assert.equal(view.viewer.cacheSize, 3);
});

test('A failed original decode leaves the selected preview open', async () => {
  const view = fixture({ deferred: true });
  view.items[0].dataset.imagePreview = 'preview-a';
  const opening = view.viewer.openImage(view.items[0]);
  assert.equal(view.elements.get('#lightbox-image').src, 'preview-a');
  assert.equal(view.images[0].src, 'a', 'desktop viewers still request originals');
  view.images[0].failDecode(new Error('Insufficient memory'));
  await opening;
  assert.equal(view.dialog.open, true);
  assert.equal(view.elements.get('#lightbox-image').src, 'preview-a');
  assert.equal(view.viewer.cacheSize, 0, 'failed decodes can be retried');
});

test('Closing while a photo decodes never reopens the viewer', async () => {
  const view = fixture({ deferred: true });
  const opening = view.viewer.openImage(view.items[0]);
  view.dialog.open = false;
  view.images[0].finishDecode();
  await opening;
  assert.equal(view.dialog.open, false);
  assert.equal(view.stage.length, 1);
  assert.equal(view.elements.get('#lightbox-image').src, 'a');
  assert.equal(view.images.length, 1, 'closed viewers do not preload neighbors');
});
