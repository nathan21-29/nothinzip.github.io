import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const source = app.slice(app.indexOf('  let imageViewerRequest = 0;'), app.indexOf('  async function closeDialog('));

function fixture({ motion = true } = {}) {
  const elements = new Map(), images = [], animations = [], stage = [];
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
  const dialog = { open: false, classList: { toggle() {} }, showModal() { this.open = true; } };
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
    Image: class extends Element {
      constructor() { super(); images.push(this); this.decodes = 0; }
      decode() { this.decodes++; return Promise.resolve(); }
    }
  });
  vm.runInContext(source + '\nglobalThis.viewer = { openImage, stepImage, clearImageTransition, get cacheSize() { return viewerImageCache.size; } };', scope);
  return { viewer: scope.viewer, items, elements, stage, images, animations, dialog,
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
