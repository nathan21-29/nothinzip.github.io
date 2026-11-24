import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../photography.js', import.meta.url), 'utf8');
const locations = [
  { id: 'kyoto', name: 'Kyoto', latitude: 35, longitude: 136, label: [140, 458] },
  { id: 'ine', name: 'Ine', latitude: 36, longitude: 135, label: [165, 385] },
  { id: 'nara', name: 'Nara', latitude: 35, longitude: 136, label: [335, 568] }
];
const photos = Object.freeze([
  { city: 'kyoto', src: '/kyoto/garden.jpg', preview: '/previews/garden.webp', width: 1600, height: 1067, alt: 'Temple garden', caption: 'Temple', note: 'Quiet <garden> & morning light', tags: ['favourite', '"Kyoto"'] },
  { city: 'ine', src: '/ine/boats.jpg', preview: '/previews/boats.webp', alt: 'Boats & "houses"', caption: 'Boathouses' },
  { city: 'kyoto', src: '/kyoto/river.jpg', alt: 'River at dusk', caption: 'River' }
].map(Object.freeze));

const entities = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" };
const decode = text => text.replace(/&(amp|lt|gt|quot|#39);/g, (_, entity) => entities[entity]);

class Element {
  constructor(tag, attributes = []) {
    this.tag = tag;
    this.attributes = new Map(attributes);
    this.children = [];
    this.listeners = new Map();
    this.classes = new Set((this.getAttribute('class') || '').split(/\s+/).filter(Boolean));
    this.classList = {
      contains: name => this.classes.has(name),
      toggle: (name, force) => force ? this.classes.add(name) : this.classes.delete(name)
    };
    this.dataset = {};
    for (const [name, value] of this.attributes) {
      if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, char) => char.toUpperCase())] = value;
    }
    this.hidden = false;
    this.disabled = false;
    this.text = '';
    this.clientHeight = 550;
    this.scrollTop = 0;
  }

  get id() { return this.getAttribute('id'); }
  get textContent() { return this.text + this.children.map(child => child.textContent).join(''); }
  set textContent(value) { this.children = []; this.text = value; }
  get scrollTop() { return this.scroll; }
  set scrollTop(value) { this.scroll = Math.round(value); }
  get firstElementChild() { return this.children[0] ?? null; }
  get lastElementChild() { return this.children.at(-1) ?? null; }
  get childElementCount() { return this.children.length; }
  get tabIndex() { return Number(this.getAttribute('tabindex') ?? (this.tag === 'button' ? 0 : -1)); }
  set tabIndex(value) { this.setAttribute('tabindex', value); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  hasAttribute(name) { return this.attributes.has(name); }
  getBoundingClientRect() { return { height: this.children.length * 200 }; }

  matches(selector) {
    return selector.split(',').some(part => {
      if (part.startsWith('#')) return this.id === part.slice(1);
      if (part.startsWith('.')) return this.classList.contains(part.slice(1));
      const [, tag, attribute] = part.match(/^([a-z-]*)(?:\[([\w-]+)\])?$/) || [];
      return tag !== undefined && (!tag || this.tag === tag) && (!attribute || this.hasAttribute(attribute));
    });
  }

  closest(selector) {
    return this.matches(selector) ? this : this.parent?.closest(selector) ?? null;
  }

  querySelectorAll(selector) {
    return this.children.flatMap(child => [
      ...(child.matches(selector) ? [child] : []),
      ...child.querySelectorAll(selector)
    ]);
  }

  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  contains(element) { return element === this || this.children.some(child => child.contains(element)); }
  append(child) { child.parent = this; this.children.push(child); }
  remove() { this.parent.children = this.parent.children.filter(child => child !== this); this.parent = null; }

  cloneNode(deep) {
    const copy = new Element(this.tag, this.attributes);
    copy.text = this.text;
    if (deep) this.children.forEach(child => copy.append(child.cloneNode(true)));
    return copy;
  }

  addEventListener(type, callback) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(callback);
    this.listeners.set(type, listeners);
  }

  emit(type, event = {}, bubbles = false) {
    event.target ??= this;
    this.listeners.get(type)?.forEach(callback => callback(event));
    if (bubbles) this.parent?.emit(type, event, true);
  }

  click() { if (!this.disabled) this.emit('click', {}, true); }

  set innerHTML(markup) {
    this.children = [];
    this.text = '';
    const stack = [this];
    for (const token of markup.match(/<[^>]+>|[^<]+/g) || []) {
      const parent = stack.at(-1);
      if (token.startsWith('</')) stack.pop();
      else if (token.startsWith('<')) {
        const [, tag] = token.match(/^<([\w-]+)/);
        const attributes = [...token.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, name, value]) => [name, decode(value)]);
        const child = new Element(tag, attributes);
        parent.append(child);
        if (tag !== 'img' && !token.endsWith('/>')) stack.push(child);
      } else parent.text += decode(token);
    }
  }
}

function fixture() {
  const document = new Element('document');
  document.innerHTML = `
    <section id="photography-screen">
      <svg id="photo-map-lines"></svg><div id="photo-map-pins"></div><div id="photo-mobile-cities"></div>
      <button id="photo-all">All photos</button><span id="photo-location-label"></span>
      <h2 id="photo-collection-title"></h2><span id="photo-count"></span><button id="photo-pause"><span></span></button>
      <div id="photo-stream"><div id="photo-roll"></div><div id="photo-empty"><span id="photo-empty-location"></span></div></div>
      <p id="photo-stream-hint"></p>
    </section>
    <dialog id="lightbox"></dialog>`;
  document.activeElement = document;
  document.hidden = false;

  const window = new Element('window');
  window.PHOTOGRAPHY_LOCATIONS = locations;
  window.PHOTOGRAPHY_PHOTOS = photos;
  const frames = new Map();
  const timers = new Map();
  let nextTimer = 1;
  let nextFrame = 1;
  const pendingResizes = new Map();
  const dialogObservers = [];
  const animations = [];
  const byId = id => document.querySelector(`#${id}`);
  const roll = byId('photo-roll');
  const stream = byId('photo-stream');
  const dialog = byId('lightbox');
  roll.animate = () => {
    let finish;
    let cancel;
    const finished = new Promise((resolve, reject) => { finish = resolve; cancel = reject; });
    // Some animations run without a consumer waiting on them.
    finished.catch(() => {});
    const animation = { finished, finish, cancel: () => cancel(new Error('Animation canceled')) };
    animations.push(animation);
    return animation;
  };
  vm.runInNewContext(source, {
    window, document, queueMicrotask,
    setTimeout(callback) { const id = nextTimer++; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); },
    Math: Object.assign(Object.create(Math), { random: () => 0 }),
    requestAnimationFrame(callback) {
      const id = nextFrame++;
      frames.set(id, callback);
      return id;
    },
    cancelAnimationFrame(id) { frames.delete(id); },
    ResizeObserver: class {
      constructor(callback) { this.callback = callback; }
      observe(target) { pendingResizes.set(target, this.callback); }
      disconnect() { pendingResizes.clear(); }
    },
    MutationObserver: class {
      constructor(callback) { this.callback = callback; }
      observe(target) { if (target === dialog) dialogObservers.push(this.callback); }
    }
  });

  return {
    gallery: window.PhotoGallery, window, document, stream, roll, animations, frames, byId,
    flushTimers() {
      const pending = [...timers.values()];
      timers.clear();
      pending.forEach(callback => callback());
    },
    runFrame(time) {
      const pending = [...frames];
      frames.clear();
      pending.forEach(([, callback]) => callback(time));
    },
    flushResize() {
      const callbacks = new Set(pendingResizes.values());
      pendingResizes.clear();
      callbacks.forEach(callback => callback());
    },
    setDialogOpen(open) {
      if (open) dialog.setAttribute('open', '');
      else { dialog.removeAttribute('open'); dialog.emit('close'); }
      dialogObservers.forEach(callback => queueMicrotask(callback));
    },
    clickCity(id, mobile = false) {
      const controls = byId(mobile ? 'photo-mobile-cities' : 'photo-map-pins');
      controls.querySelectorAll('[data-photo-city]').find(node => node.dataset.photoCity === id && !node.hasAttribute('aria-hidden')).click();
    },
    cards() { return roll.firstElementChild?.querySelectorAll('button') ?? []; }
  };
}

const images = fixture => fixture.cards().map(card => card.dataset.image);
const settle = () => new Promise(resolve => setImmediate(resolve));

test('Opening the gallery shuffles the original collection and preserves card metadata', () => {
  const originalOrder = photos.map(photo => photo.src);
  const view = fixture();
  assert.deepEqual(images(view), [], 'photo requests wait until the gallery opens');
  view.gallery.setActive(true);
  assert.equal(view.byId('photo-count').textContent, '3 photos');
  assert.deepEqual(images(view).sort(), [...originalOrder].sort());
  assert.notDeepEqual(images(view), originalOrder);
  assert.deepEqual(photos.map(photo => photo.src), originalOrder);
  for (const card of view.cards()) {
    const photo = photos.find(photo => photo.src === card.dataset.image);
    const city = locations.find(location => location.id === photo.city);
    const preview = card.querySelector('img');
    assert.equal(preview.getAttribute('src'), photo.preview || photo.src);
    assert.equal(preview.getAttribute('alt'), photo.alt);
    if (photo.width) {
      assert.equal(preview.getAttribute('width'), String(photo.width));
      assert.equal(preview.getAttribute('height'), String(photo.height));
    }
    assert.equal(card.dataset.imageAlt, photo.alt);
    assert.equal(card.dataset.imageNote, photo.note || '');
    assert.deepEqual(JSON.parse(card.dataset.imageTags), photo.tags || []);
    assert.ok(card.dataset.imageCaption.includes(photo.caption));
    assert.ok(card.dataset.imageCaption.includes(city.name));
  }
});

test('Desktop and mobile filters update selection, card counts and empty states', () => {
  const view = fixture();
  view.gallery.setMotion(false);
  view.gallery.setActive(true);
  view.clickCity('kyoto');
  assert.equal(view.byId('photo-collection-title').textContent, '京都 • Kyoto');
  assert.equal(view.byId('photo-location-label').textContent, 'Kyoto');
  assert.equal(view.byId('photo-count').textContent, '2 photos');
  assert.equal(view.byId('photo-all').getAttribute('aria-pressed'), 'false');
  assert.deepEqual(images(view).sort(), photos.filter(photo => photo.city === 'kyoto').map(photo => photo.src).sort());
  const kyotoButtons = view.document.querySelectorAll('[data-photo-city]').filter(node => node.dataset.photoCity === 'kyoto');
  assert.ok(kyotoButtons.every(button => button.classList.contains('is-selected')));
  assert.ok(kyotoButtons.filter(button => !button.hasAttribute('aria-hidden')).every(button => button.getAttribute('aria-pressed') === 'true'));

  view.clickCity('nara', true);
  assert.equal(view.byId('photo-count').textContent, '0 photos');
  assert.equal(view.byId('photo-empty-location').textContent, 'Nara');
  assert.equal(view.byId('photo-empty').hidden, false);
  assert.deepEqual(images(view), []);
  assert.ok(kyotoButtons.every(button => !button.classList.contains('is-selected')));

  view.byId('photo-all').click();
  assert.equal(view.byId('photo-all').getAttribute('aria-pressed'), 'true');
  assert.equal(view.byId('photo-count').textContent, '3 photos');
  assert.equal(view.byId('photo-empty').hidden, true);
});

test('Playback advances, pauses on motion or visibility changes, and resumes after a dialog closes', async () => {
  const view = fixture();
  const pause = view.byId('photo-pause');
  assert.equal(view.frames.size, 0);
  view.gallery.setActive(true);
  assert.equal(view.frames.size, 1);
  for (const time of [100, 116, 132, 148]) view.runFrame(time);
  assert.equal(view.stream.scrollTop, 601, 'fractional motion accumulates in the middle copy');

  pause.click();
  assert.equal(view.frames.size, 0);
  assert.equal(pause.getAttribute('aria-pressed'), 'true');
  pause.click();
  assert.equal(view.frames.size, 1);
  assert.equal(pause.getAttribute('aria-pressed'), 'false');

  view.gallery.setMotion(false);
  assert.equal(pause.disabled, true);
  assert.equal(view.frames.size, 0);
  view.gallery.setMotion(true);
  assert.equal(pause.disabled, false);
  assert.equal(view.frames.size, 1);

  view.document.hidden = true;
  view.document.emit('visibilitychange');
  assert.equal(view.frames.size, 0);
  view.document.hidden = false;
  view.document.emit('visibilitychange');
  assert.equal(view.frames.size, 1);

  view.window.emit('blur');
  view.flushResize();
  assert.equal(view.frames.size, 0);
  view.window.emit('focus');
  assert.equal(view.frames.size, 1);

  view.setDialogOpen(true);
  await settle();
  assert.equal(view.frames.size, 0);
  view.setDialogOpen(false);
  await settle();
  assert.equal(view.frames.size, 1);

  view.gallery.setActive(false);
  assert.equal(view.frames.size, 0);
  view.flushResize();
  assert.equal(view.frames.size, 0);
});

test('Autoplay loops across duplicate cards while keeping one keyboard stop per photo', () => {
  const view = fixture();
  view.gallery.setActive(true);
  assert.ok(view.roll.children.length > 1);
  assert.ok(view.cards().every(card => card.tabIndex === 0));
  for (const copy of view.roll.children.slice(1)) {
    const cards = copy.querySelectorAll('button');
    assert.equal(copy.getAttribute('aria-hidden'), 'true');
    assert.deepEqual(cards.map(card => card.dataset.image), images(view));
    assert.ok(cards.every(card => card.tabIndex === -1));
  }

  view.runFrame(100);
  view.stream.scrollTop = view.roll.firstElementChild.getBoundingClientRect().height * 2 - 1;
  view.runFrame(150);
  assert.equal(view.stream.scrollTop, 600);
  assert.equal(view.frames.size, 1);
});

test('Mouse hover suspends autoplay and a touch scroll pauses until the user presses Play', () => {
  const view = fixture();
  view.gallery.setActive(true);
  view.stream.emit('pointerenter', { pointerType: 'mouse' });
  assert.equal(view.frames.size, 0);
  view.stream.emit('pointerleave');
  assert.equal(view.frames.size, 1);

  view.stream.emit('touchstart');
  assert.equal(view.frames.size, 0);
  view.stream.emit('touchend');
  assert.equal(view.frames.size, 0);
  const pause = view.byId('photo-pause');
  assert.equal(pause.getAttribute('aria-label'), 'Play photo carousel');
  pause.click();
  assert.equal(view.frames.size, 1);
});

test('One photo renders one focusable card and disables autoplay', async () => {
  const view = fixture();
  view.gallery.setActive(true);
  view.clickCity('ine');
  view.animations[0].finish();
  await settle();
  assert.equal(view.byId('photo-count').textContent, '1 photo');
  assert.equal(view.roll.children.length, 1);
  assert.deepEqual(images(view), [photos[1].src]);
  assert.equal(view.cards()[0].tabIndex, 0);
  assert.equal(view.byId('photo-pause').disabled, true);
  assert.equal(view.frames.size, 0);

  view.gallery.setActive(false);
  view.gallery.setActive(true);
  assert.equal(view.roll.children.length, 1);
  assert.equal(view.frames.size, 0);
});

test('Only the latest filter renders, with autoplay suspended during the fade-out', async () => {
  const view = fixture();
  view.gallery.setActive(true);
  view.clickCity('kyoto');
  view.clickCity('ine', true);
  await settle();
  assert.equal(view.stream.getAttribute('aria-busy'), 'true');
  const playingBeforeResize = view.byId('photography-screen').classList.contains('is-playing');
  assert.equal(view.byId('photo-collection-title').textContent, '伊根 • Ine');
  assert.equal(view.byId('photo-count').textContent, '3 photos');
  view.flushResize();
  const framesWhileFiltering = view.frames.size;

  view.animations[1].finish();
  await settle();
  assert.equal(view.stream.hasAttribute('aria-busy'), false);
  assert.deepEqual(images(view), [photos[1].src]);
  assert.equal(view.frames.size, 0);
  assert.equal(framesWhileFiltering, 0, 'a resize callback must not restart autoplay while the filter is pending');
  assert.equal(playingBeforeResize, false, 'the playback indicator clears as soon as filtering begins');
});

test('Leaving the gallery cancels a pending filter and releases the busy state', async () => {
  const view = fixture();
  view.gallery.setActive(true);
  view.clickCity('kyoto');
  assert.equal(view.stream.getAttribute('aria-busy'), 'true');
  view.gallery.setActive(false);
  await settle();
  view.flushResize();
  assert.equal(view.stream.hasAttribute('aria-busy'), false);
  assert.equal(view.byId('photo-count').textContent, '3 photos');
  assert.equal(view.frames.size, 0);

  view.gallery.setActive(true);
  assert.equal(view.byId('photo-count').textContent, '2 photos');
  assert.equal(view.frames.size, 1);
});

function flick(view, distance = 10, releaseTime = 110, type = 'pointerup') {
  view.stream.emit('pointerdown', { pointerType: 'mouse', button: 0, pointerId: 1, clientY: 200, timeStamp: 100 });
  view.stream.emit('pointermove', { pointerId: 1, clientY: 200 - distance, timeStamp: 110, preventDefault() {} });
  view.stream.emit(type, { type, pointerId: 1, timeStamp: releaseTime });
}

test('Lazy image loads and resize notifications do not recenter an already sized stream', () => {
  const view = fixture();
  view.gallery.setActive(true);
  view.stream.scrollTop = 400;
  for (const image of view.roll.querySelectorAll('img')) {
    view.roll.emit('load', { target: image });
    assert.equal(view.stream.scrollTop, 400, 'loading a copy must not jump to another cycle');
  }
  view.flushResize();
  assert.equal(view.stream.scrollTop, 400);
});

test('Touch gestures and native inertia finish before infinite scrolling recenters', () => {
  const view = fixture();
  view.gallery.setActive(true);
  view.stream.emit('touchstart');
  view.stream.scrollTop = 200;
  view.stream.emit('scroll');
  view.flushTimers();
  assert.equal(view.stream.scrollTop, 200, 'never recenter under the finger');
  view.stream.emit('touchend');
  view.stream.scrollTop = 150;
  view.stream.emit('scroll');
  assert.equal(view.stream.scrollTop, 150, 'inertia keeps ownership of scrollTop');
  view.flushTimers();
  assert.equal(view.stream.scrollTop, 750, 'recenter once scrolling settles');
  assert.equal(view.frames.size, 0, 'touch scrolling leaves autoplay paused');
});

test('Loaded previews ready their loop copies without eagerly fetching unseen photos', () => {
  const view = fixture();
  view.gallery.setActive(true);
  const images = view.roll.querySelectorAll('img');
  const lazy = images.find(image => image.getAttribute('loading') === 'lazy');
  const source = lazy.getAttribute('src');
  view.roll.emit('load', { target: lazy });
  assert.ok(images.filter(image => image.getAttribute('src') === source).every(image => image.getAttribute('loading') === 'eager'));
  assert.equal(view.stream.scrollTop, 600);
});

test('A released drag coasts in its direction and only loses speed, then stops scheduling frames', () => {
  for (const direction of [-1, 1]) {
    const view = fixture();
    view.gallery.setActive(true);
    flick(view, direction * 10);
    let previous = view.stream.scrollTop;
    let previousStep = 16;
    for (let time = 126; time <= 270; time += 16) {
      view.runFrame(time);
      const step = (view.stream.scrollTop - previous) * direction;
      assert.ok(step > 0 && step <= 16, 'release never accelerates beyond the cursor speed');
      assert.ok(step <= previousStep + 1, 'friction reduces speed, allowing integer scroll rounding');
      previousStep = step;
      previous = view.stream.scrollTop;
    }
    for (let time = 286; time < 2500; time += 16) view.runFrame(time);
    assert.equal(view.frames.size, 0);
  }
});

test('Faster releases coast farther; holding still or canceling produces no throw', () => {
  const distances = [5, 10].map(distance => {
    const view = fixture();
    view.gallery.setActive(true);
    flick(view, distance);
    const start = view.stream.scrollTop;
    for (let time = 126; time <= 270; time += 16) view.runFrame(time);
    return view.stream.scrollTop - start;
  });
  assert.ok(distances[1] > distances[0] * 1.9);
  for (const [releaseTime, type] of [[210, 'pointerup'], [110, 'pointercancel']]) {
    const view = fixture();
    view.gallery.setActive(true);
    flick(view, 10, releaseTime, type);
    assert.equal(view.frames.size, 0);
  }
});

test('A new grab, hidden document, or leaving the gallery immediately cancels coasting', () => {
  for (const interrupt of [
    view => view.stream.emit('pointerdown', { pointerType: 'mouse', button: 0, pointerId: 2, clientY: 200, timeStamp: 130 }),
    view => { view.document.hidden = true; view.document.emit('visibilitychange'); },
    view => view.gallery.setActive(false)
  ]) {
    const view = fixture();
    view.gallery.setActive(true);
    flick(view);
    view.runFrame(126);
    interrupt(view);
    const stopped = view.stream.scrollTop;
    view.runFrame(142);
    assert.equal(view.stream.scrollTop, stopped);
    assert.equal(view.frames.size, 0);
  }
});
