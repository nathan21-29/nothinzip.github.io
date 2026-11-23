import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const timelineSource = readFileSync(new URL('../intro-timeline.js', import.meta.url), 'utf8');
const bootSource = readFileSync(new URL('../intro-boot.js', import.meta.url), 'utf8');
const runtimeSource = readFileSync(new URL('../intro.js', import.meta.url), 'utf8');
const hudSource = readFileSync(new URL('../intro-hud.js', import.meta.url), 'utf8');
const starsSource = readFileSync(new URL('../intro-stars.js', import.meta.url), 'utf8');

function timelineFixture() {
  const window = {};
  vm.runInNewContext(timelineSource, { window });
  return window.IntroTimeline;
}

test('Timeline cursor arrives at all three circle hit positions', () => {
  const timeline = timelineFixture();
  for (const circle of timeline.circles) {
    const cursor = timeline.cursorAt(circle.hit);
    assert.ok(Math.abs(cursor.x - circle.x) < 1e-9);
    assert.ok(Math.abs(cursor.y - circle.y) < 1e-9);
  }
});

test('Timeline cursor aligns with slider head, tail, and final hit', () => {
  const timeline = timelineFixture();
  const head = timeline.cursorAt(timeline.slider.start);
  const tail = timeline.cursorAt(timeline.slider.end);
  const final = timeline.cursorAt(timeline.final.hit);
  assert.equal(head.x, timeline.slider.points[0].x);
  assert.equal(head.y, timeline.slider.points[0].y);
  assert.equal(tail.x, timeline.slider.points.at(-1).x);
  assert.equal(tail.y, timeline.slider.points.at(-1).y);
  assert.ok(Math.abs(final.x - timeline.final.x) < 1e-9);
  assert.ok(Math.abs(final.y - timeline.final.y) < 1e-9);
  assert.equal(timeline.duration, 3860);
  assert.ok(timeline.duration >= 3000 && timeline.duration <= 4000);
});

test('Timeline travels continuously through circle, slider, and final boundaries', () => {
  const timeline = timelineFixture();
  const boundaries = [620, timeline.slider.start, timeline.slider.end, timeline.final.hit];
  for (const time of boundaries) {
    const at = timeline.cursorAt(time);
    for (const offset of [-0.001, 0.001]) {
      const near = timeline.cursorAt(time + offset);
      assert.ok(Math.hypot(near.x - at.x, near.y - at.y) < 0.01);
    }
  }
  assert.deepEqual(timeline.cursorAt(-100), timeline.cursorAt(0));
  assert.deepEqual(timeline.cursorAt(5000), timeline.final);
});

test('Timeline keeps tangent direction continuous at each hit boundary and bends between hits', () => {
  const timeline = timelineFixture();
  const boundaries = [...timeline.circles.map(point => point.hit), timeline.slider.start, timeline.slider.end, timeline.final.hit];
  const epsilon = 0.05;
  for (const time of boundaries) {
    const before = timeline.cursorAt(time - epsilon), at = timeline.cursorAt(time), after = timeline.cursorAt(time + epsilon);
    const left = { x: (at.x - before.x) / epsilon, y: (at.y - before.y) / epsilon };
    const right = { x: (after.x - at.x) / epsilon, y: (after.y - at.y) / epsilon };
    assert.ok(Math.hypot(left.x - right.x, left.y - right.y) < 0.03, `tangent discontinuity at ${time}ms`);
  }
  const start = timeline.cursorAt(120), end = timeline.cursorAt(620), middle = timeline.cursorAt(370);
  const linearMiddle = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  assert.ok(Math.hypot(middle.x - linearMiddle.x, middle.y - linearMiddle.y) > 5);
});

function bootFixture({
  hostname = 'example.com', protocol = 'https:', search = '', hash = '', seen = false,
  motion = null, reduced = false, storageBlocked = false
} = {}) {
  const listeners = { window: new Map(), document: new Map() };
  const timers = new Map();
  const storage = new Map(seen ? [['nathan-intro-seen', '1']] : []);
  const root = { dataset: {}, removed: [], removeAttribute(name) { this.removed.push(name); if (name === 'data-intro') delete this.dataset.intro; } };
  const dispatched = [];
  const document = {
    documentElement: root, hidden: false,
    addEventListener(type, fn) { listeners.document.set(type, fn); },
    dispatchEvent(event) { dispatched.push(event.type); }
  };
  const window = {
    addEventListener(type, fn, options) { listeners.window.set(type, { fn, options }); }
  };
  const context = {
    window, document,
    location: { hostname, protocol, search, hash },
    URLSearchParams,
    sessionStorage: {
      getItem(key) { if (storageBlocked) throw new Error('blocked'); return storage.get(key) ?? null; },
      setItem(key, value) { if (storageBlocked) throw new Error('blocked'); storage.set(key, value); }
    },
    localStorage: { getItem() { if (storageBlocked) throw new Error('blocked'); return motion; } },
    matchMedia: () => ({ matches: reduced }),
    Event: class { constructor(type) { this.type = type; } },
    setTimeout(fn, delay) { const id = timers.size + 1; timers.set(id, { fn, delay }); return id; },
    clearTimeout(id) { timers.delete(id); }
  };
  vm.runInNewContext(bootSource, context);
  return { intro: window.SiteIntro, listeners, timers, storage, root, dispatched, document };
}

function inputEvent(key, extra = {}) {
  return { key, prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; }, ...extra };
}

function runtimeFixture({
  width = 1440, height = 900, reduced = false, systemReduced = false, failSvg = false, offscreen = false,
  failCanvas = false, dpr = 1, cores = 8, memory = 8
} = {}) {
  const listeners = new Map();
  const frames = new Map();
  const created = [];
  const warnings = [];
  let nextFrame = 1;
  const values = new Map();
  const writes = [];
  const attributeWrites = [];
  class CanvasContext {
    constructor() { this.operations = []; this.images = []; this.fills = []; this.globalAlpha = 1; }
    setTransform(...args) { this.operations.push(['setTransform', ...args]); }
    clearRect(...args) { this.operations.push(['clearRect', ...args]); }
    beginPath() { this.operations.push(['beginPath']); }
    moveTo(...args) { this.operations.push(['moveTo', ...args]); }
    lineTo(...args) { this.operations.push(['lineTo', ...args]); }
    closePath() { this.operations.push(['closePath']); }
    fill() { this.operations.push(['fill']); }
    fillRect(...args) { this.fills.push({ args, opacity: this.globalAlpha }); }
    drawImage(source, sx, sy, sw, sh, x, y, width, height) {
      this.images.push({ source, sx, sy, sw, sh, x, y, width, height, opacity: this.globalAlpha });
    }
  }
  const style = {
    setProperty(key, value) { values.set(key, value); writes.push([key, value]); },
    removeProperty(key) { values.delete(key); },
    getPropertyValue(key) { return values.get(key) ?? ''; },
    [Symbol.iterator]() { return values.keys(); }
  };
  class Element {
    constructor(tag = 'div') { this.tagName = tag; this.attributes = new Map(); this.children = []; this.style = { setProperty(name, value) { this[name] = String(value); } }; this.inert = false; this.classList = { contains: name => this.classes?.has(name) ?? false }; }
    setAttribute(key, value) { this.attributes.set(key, String(value)); attributeWrites.push([this, key, value]); }
    getAttribute(key) { return this.attributes.get(key); }
    append(child) { this.children.push(child); child.parent = this; }
    prepend(child) { this.children.unshift(child); child.parent = this; }
    remove() { this.removed = true; if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); }
    blur() { this.blurred = true; }
    closest(selector) { return selector === '.cookie-anchor' ? anchor : null; }
    getBoundingClientRect() { return this.rect ?? { left: 620, top: 300, width: 200, height: 200 }; }
    getContext() { return failCanvas ? null : (this.context ??= new CanvasContext()); }
    set innerHTML(value) { this.markup = value; }
    querySelector(selector) {
      if (selector === 'g') { const node = new Element('g'); this.append(node); return node; }
      if (selector === '.intro-skip') { this.skip ??= new Element('p'); return this.skip; }
      return null;
    }
  }
  const cookie = new Element('button');
  const anchor = new Element('div');
  anchor.getBoundingClientRect = () => ({ left: width / 2 - 100, top: offscreen ? height : height / 2 - 100, width: 200, height: 200 });
  const inertElements = ['.topbar', '#main-content', '.bottom-bar'].map(() => new Element());
  inertElements[0].inert = true;
  const root = { dataset: { intro: 'pending' }, style, removeAttribute(name) { if (name === 'data-intro') delete this.dataset.intro; } };
  const body = new Element('body');
  body.classList.contains = name => name === 'reduced-motion' && reduced;
  const document = {
    documentElement: root, body, activeElement: body,
    querySelector(selector) { return selector === '#main-cookie' ? cookie : null; },
    querySelectorAll() { return inertElements; },
    createElement(tag) { const node = new Element(tag); created.push(node); return node; },
    createElementNS(_ns, tag) { if (failSvg) throw new Error('SVG unavailable'); return new Element(tag); }
  };
  const motionListeners = new Set();
  const motionQuery = { matches: systemReduced, addEventListener(_type, fn) { motionListeners.add(fn); }, removeEventListener(_type, fn) { motionListeners.delete(fn); } };
  class MutationObserverStub { constructor(fn) { this.fn = fn; } observe() {} disconnect() { this.disconnected = true; } }
  class ImageStub {}
  const intro = {
    active: true, reduced, reviewTime: null, cleanups: [],
    onFinish(fn) { this.cleanups.push(fn); },
    finish() {
      if (!this.active) return;
      this.active = false;
      for (const fn of this.cleanups.splice(0)) fn();
      root.removeAttribute('data-intro');
    }
  };
  const window = {
    SiteIntro: intro,
    IntroTimeline: timelineFixture(),
    navigator: { hardwareConcurrency: cores, deviceMemory: memory }, devicePixelRatio: dpr,
    addEventListener(type, fn) { listeners.set(type, fn); },
    removeEventListener(type, fn) { if (listeners.get(type) === fn) listeners.delete(type); }
  };
  const context = {
    window, document, innerWidth: width, innerHeight: height,
    matchMedia: () => motionQuery,
    MutationObserver: MutationObserverStub,
    Image: ImageStub,
    getComputedStyle: () => ({ fontSize: '16px' }),
    requestAnimationFrame(fn) { const id = nextFrame++; frames.set(id, fn); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
    console: { warn(...args) { warnings.push(args); } }
  };
  vm.runInNewContext(hudSource, context);
  vm.runInNewContext(starsSource, context);
  vm.runInNewContext(runtimeSource, context);
  return {
    intro, frames, listeners, motionListeners, warnings, values, writes, attributeWrites, style, root, body, document,
    field: created.find(node => node.className === 'intro-playfield'), inertElements,
    canvas: created.find(node => node.className === 'intro-star-burst'),
    atlas: created.find(node => node.tagName === 'canvas' && !node.className)
  };
}

function runFrame(fixture, timestamp) {
  const entry = fixture.frames.entries().next().value;
  assert.ok(entry, 'expected a pending animation frame');
  fixture.frames.delete(entry[0]);
  entry[1](timestamp);
}

function descendants(node) {
  return node.children.flatMap(child => [child, ...descendants(child)]);
}

function burstFrame(fixture, timestamp) {
  fixture.canvas.context.images.length = 0;
  fixture.canvas.context.fills.length = 0;
  runFrame(fixture, timestamp);
  return fixture.canvas.context.images.map(image => ({
    ...image, x: image.x + image.width / 2, y: image.y + image.height / 2
  }));
}

test('WhiteCat HUD tracks hits, slider hold, and topples backward on the final note', () => {
  const fixture = runtimeFixture();
  const nodes = descendants(fixture.field);
  const byClass = name => nodes.find(node => node.className?.split(' ').includes(name));
  const value = name => byClass(name).getAttribute('data-value');
  const keys = nodes.filter(node => node.className === 'intro-hud-key');
  const boards = nodes.filter(node => node.className?.split(' ').includes('intro-hud-board'));
  runFrame(fixture, 0);
  assert.equal(value('intro-hud-score-value'), '00000000');
  assert.equal(value('intro-hud-combo-value'), '0x');
  runFrame(fixture, 650);
  assert.equal(value('intro-hud-combo-value'), '1x');
  assert.equal(keys[0].getAttribute('data-down'), 'true');
  runFrame(fixture, 1900);
  assert.equal(value('intro-hud-combo-value'), '4x');
  assert.equal(keys[1].getAttribute('data-down'), 'true');
  runFrame(fixture, 2200);
  assert.equal(value('intro-hud-combo-value'), '5x');
  assert.equal(keys[1].getAttribute('data-down'), 'true', 'slider holds K2');
  runFrame(fixture, 2500);
  assert.equal(keys[1].getAttribute('data-down'), 'false');
  assert.equal(value('intro-hud-score-value'), '00001042');
  assert.ok(boards.every(node => /rotate[XY]\(0deg\)/.test(node.style.transform)));
  runFrame(fixture, 2820);
  assert.equal(value('intro-hud-combo-value'), '7x');
  assert.equal(keys[0].getAttribute('data-down'), 'true');
  runFrame(fixture, 3000);
  assert.equal(value('intro-hud-score-value'), '00001558');
  assert.match(byClass('intro-hud-score').style.transform, /rotateX\(-[\d.]+deg\)/);
  assert.match(byClass('intro-hud-keys').style.transform, /rotateY\(-[\d.]+deg\)/);
  assert.match(byClass('intro-hud-combo').style.transform, /rotateX\([\d.]+deg\)/);
  runFrame(fixture, 3400);
  assert.ok(boards.every(node => node.style.opacity === '0'));
  fixture.intro.finish();
  assert.equal(fixture.field.removed, true);
});

test('Background stays black through gameplay and fades in with the menu', () => {
  const fixture = runtimeFixture();
  runFrame(fixture, 0);
  runFrame(fixture, 2820);
  assert.equal(fixture.values.get('--intro-background'), '0');
  runFrame(fixture, 3100);
  assert.equal(fixture.values.get('--intro-background'), '0');
  runFrame(fixture, 3300);
  const opacity = Number(fixture.values.get('--intro-background'));
  assert.ok(opacity > 0 && opacity < 1);
  assert.equal(fixture.values.get('--intro-background'), fixture.values.get('--intro-profile'));
  runFrame(fixture, 3830);
  assert.equal(fixture.values.get('--intro-background'), '1');
  fixture.intro.finish();
  assert.equal(fixture.values.has('--intro-background'), false);
});

test('Final hit flashes softly and sends varied stars inward from both lower edges', () => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const fixture = runtimeFixture(viewport);
    const starCount = viewport.width < 600 ? 72 : 120;
    runFrame(fixture, 0);
    assert.equal(burstFrame(fixture, 2819).length, 0);
    assert.equal(fixture.canvas.context.fills.length, 0);
    burstFrame(fixture, 2865);
    assert.equal(fixture.canvas.context.fills[0].opacity, .22);
    const emitted = [];
    for (const time of [2920, 3020, 3120, 3220]) {
      emitted.push(burstFrame(fixture, time).length);
    }
    const batches = emitted.map((count, index) => count - (emitted[index - 1] ?? 0));
    // Some small-screen stars are still outside the viewport immediately after launch.
    assert.ok(emitted[1] > emitted[3] - emitted[1] && batches[1] > batches[2] && batches[2] > batches[3], 'visible emission should taper after the stars enter the viewport');
    const stars = burstFrame(fixture, 3500);
    assert.equal(stars.length, starCount);
    assert.ok(new Set(stars.map(star => star.opacity)).size > 10);
    assert.ok(new Set(stars.map(star => star.width)).size > 10);
    const left = stars.slice(0, starCount / 2), right = stars.slice(starCount / 2);
    assert.ok(left.every(star => star.x < viewport.width / 2));
    assert.ok(right.every(star => star.x > viewport.width / 2));
    assert.ok(stars.every(star => star.y < viewport.height));
    assert.ok(burstFrame(fixture, 3830).length > 0);
    assert.equal(fixture.canvas.context.fills.length, 0);
    runFrame(fixture, 3860);
    assert.equal(fixture.intro.active, false);
    assert.ok(fixture.inertElements.slice(1).every(element => !element.inert));
    const falling = burstFrame(fixture, 4300);
    const fallen = burstFrame(fixture, 4450);
    assert.ok(fallen.some(star => star.x > 0 && star.x < viewport.width * .025), 'falling stars should reach the left edge');
    assert.ok(fallen.some(star => star.x < viewport.width && star.x > viewport.width * .975), 'falling stars should reach the right edge');
    assert.ok(fallen.reduce((sum, star) => sum + star.y, 0) / fallen.length > falling.reduce((sum, star) => sum + star.y, 0) / falling.length, 'stars should fall downward under gravity');
    runFrame(fixture, 5320);
    assert.equal(fixture.field.removed, true);
    assert.equal(fixture.canvas.width, 0);
    assert.equal(fixture.atlas.width, 0);
  }
});

test('Star burst caps backing pixels on high-DPI and 4K screens', () => {
  for (const viewport of [{ width: 390, height: 844, dpr: 3 }, { width: 3840, height: 2160, dpr: 2 }]) {
    const fixture = runtimeFixture(viewport);
    assert.ok(fixture.canvas.width <= viewport.width * 1.5);
    assert.ok(fixture.canvas.height <= viewport.height * 1.5);
    assert.ok(fixture.canvas.width * fixture.canvas.height <= 2000000);
    fixture.intro.finish();
  }
});

test('Modest hardware and slow frame cadence use fewer stars without narrowing the fan', () => {
  for (const options of [{ cores: 4 }, { memory: 4 }, { slow: true }, { cores: 2, width: 390, height: 844 }]) {
    const fixture = runtimeFixture({ ...options, dpr: 3 });
    runFrame(fixture, 0);
    if (options.slow) for (let time = 33; time < 2820; time += 33) runFrame(fixture, time);
    const stars = burstFrame(fixture, 3500);
    assert.equal(stars.length, options.width ? 48 : 72);
    assert.ok(fixture.canvas.width * fixture.canvas.height <= 1000000);
    const width = options.width ?? 1440;
    assert.ok(stars.some(star => star.x < width * .025));
    assert.ok(stars.some(star => star.x > width * .975));
    assert.ok(stars.some(star => star.x > width * .1 && star.x < width * .4));
    assert.ok(stars.some(star => star.x < width * .9 && star.x > width * .6));
    fixture.intro.finish();
  }
});

test('Star frames reuse cached sprites without DOM writes or fresh paths', () => {
  const fixture = runtimeFixture();
  const paint = fixture.canvas.context;
  const atlasOperations = fixture.atlas.context.operations.length;
  runFrame(fixture, 0);
  runFrame(fixture, 2600);
  assert.equal(paint.operations.length, 1, 'only the initial canvas transform is needed before the hit');
  assert.equal(paint.images.length, 0);
  burstFrame(fixture, 3860); // interactive menu; only the star tail remains
  const writes = fixture.attributeWrites.length;
  const operations = paint.operations.length;
  const stars = burstFrame(fixture, 4050);
  assert.ok(stars.length > 0);
  assert.equal(fixture.attributeWrites.length, writes);
  assert.equal(fixture.atlas.context.operations.length, atlasOperations);
  assert.deepEqual(paint.operations.slice(operations).map(op => op[0]), ['clearRect']);
  assert.equal(descendants(fixture.field).filter(node => node.tagName === 'polygon').length, 0);
  // Hidden tabs promptly release the tail and both backing stores.
  fixture.document.hidden = true;
  runFrame(fixture, 4100);
  assert.equal(fixture.field.removed, true);
  assert.equal(fixture.canvas.width, 0);
  assert.equal(fixture.atlas.width, 0);
  assert.equal(fixture.frames.size, 0);
});

test('Unavailable canvas omits the burst and completes the intro normally', () => {
  const fixture = runtimeFixture({ failCanvas: true });
  runFrame(fixture, 0);
  runFrame(fixture, 3860);
  assert.equal(fixture.intro.active, false);
  assert.ok(fixture.inertElements.slice(1).every(element => !element.inert));
  runFrame(fixture, 5320);
  assert.equal(fixture.field.removed, true);
  assert.deepEqual(fixture.warnings, []);
});

test('Runtime renders through the final cookie morph and restores inert state', () => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 568 }]) {
  const fixture = runtimeFixture(viewport);
  assert.ok(fixture.field);
  assert.ok(fixture.inertElements.every(element => element.inert));
  runFrame(fixture, 100); // establish the clock origin
  runFrame(fixture, 3700); // elapsed 3600ms: the logo has reached its final pose
  assert.equal(fixture.values.get('--intro-logo-scale'), '1');
  assert.equal(fixture.values.get('--intro-number'), '0');
  assert.equal(fixture.values.get('--intro-logo-opacity'), '1');
  runFrame(fixture, 3960); // elapsed 3860ms
  assert.equal(fixture.intro.active, false);
  assert.ok(fixture.inertElements[0].inert);
  assert.ok(fixture.inertElements.slice(1).every(element => !element.inert));
  assert.notEqual(fixture.field.removed, true);
  runFrame(fixture, 5420); // remaining stars finish falling after the menu becomes interactive
  assert.equal(fixture.field.removed, true);
  assert.equal([...fixture.style].some(key => key.startsWith('--intro-')), false);
  assert.deepEqual(fixture.warnings, []);
  }
});

test('Short landscape windows with offscreen logos remain usable', () => {
  const fixture = runtimeFixture({ width: 844, height: 390, offscreen: true });
  assert.equal(fixture.intro.active, false);
  assert.equal(fixture.field, undefined);
  assert.equal(fixture.frames.size, 0);
  assert.ok(fixture.inertElements.slice(1).every(element => !element.inert));
});

test('Runtime reduced motion completes its 180ms fade', () => {
  const fixture = runtimeFixture({ reduced: true });
  runFrame(fixture, 10);
  runFrame(fixture, 190);
  assert.equal(fixture.intro.active, false);
  assert.ok(fixture.writes.some(([key, value]) => key === '--intro-profile' && value === '1'));
  assert.ok(fixture.writes.some(([key, value]) => key === '--intro-logo-opacity' && value === '1'));
  assert.equal(fixture.field, undefined);
  assert.deepEqual(fixture.warnings, []);
});

test('Runtime skip cancels the scheduled frame and releases all overlays', () => {
  const fixture = runtimeFixture();
  fixture.intro.finish();
  assert.equal(fixture.intro.active, false);
  assert.equal(fixture.frames.size, 0);
  assert.equal(fixture.field.removed, true);
  assert.ok(fixture.inertElements[0].inert);
  assert.ok(fixture.inertElements.slice(1).every(element => !element.inert));
});

test('Runtime failures restore the page instead of leaving it hidden', () => {
  const fixture = runtimeFixture({ failSvg: true });
  assert.equal(fixture.intro.active, false);
  assert.equal(fixture.warnings.length, 1);
  assert.ok(fixture.inertElements[0].inert);
  assert.ok(fixture.inertElements.slice(1).every(element => !element.inert));
});

test('Runtime resize finishes safely at desktop and mobile viewport sizes', () => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const fixture = runtimeFixture(viewport);
    assert.ok(fixture.field);
    fixture.listeners.get('resize')();
    assert.equal(fixture.intro.active, false);
    assert.equal(fixture.field.removed, true);
    assert.ok(fixture.inertElements.slice(1).every(element => !element.inert));
    assert.deepEqual(fixture.warnings, []);
  }
});

test('Boot eligibility honors session storage, deep links, replay, and production safety', () => {
  assert.equal(bootFixture({ seen: true }).intro.active, false);
  assert.equal(bootFixture({ hash: '#about' }).intro.active, false);
  assert.equal(bootFixture({ search: '?intro=replay', seen: true }).intro.active, false);
  const localReplay = bootFixture({ hostname: 'localhost', search: '?intro=replay&introAt=6000', seen: true });
  assert.equal(localReplay.intro.active, true);
  assert.equal(localReplay.intro.reviewTime, 5320);
  assert.equal(localReplay.timers.size, 1);
  assert.equal(bootFixture({ hostname: 'example.com', search: '?intro=replay' }).intro.active, true);
  assert.equal(bootFixture({ hostname: 'example.com', search: '?intro=replay', seen: true }).intro.active, false);
  assert.equal(bootFixture({ hostname: 'example.com', search: '?intro=off' }).intro.active, true);
  assert.equal(bootFixture({ hostname: 'localhost', search: '?intro=off' }).intro.active, false);
});

test('Boot handles storage failures without letting system reduced motion disable gameplay', () => {
  const fixture = bootFixture({ storageBlocked: true, reduced: true });
  assert.equal(fixture.intro.active, true);
  assert.equal(fixture.intro.reduced, false);
  assert.equal(fixture.root.dataset.intro, 'pending');
  fixture.intro.finish();
  assert.equal(fixture.intro.active, false);
  assert.deepEqual(fixture.dispatched, ['site:intro-end']);
  assert.deepEqual(fixture.root.removed, ['data-intro']);
});

test('Only the site motion preference reduces the intro', () => {
  assert.equal(bootFixture({ reduced: true }).intro.reduced, false);
  assert.equal(bootFixture({ reduced: true, motion: 'on' }).intro.reduced, false);
  const disabled = bootFixture({ motion: 'off' });
  assert.equal(disabled.intro.reduced, true);
  assert.equal(disabled.root.dataset.intro, 'fade');
  const runtime = runtimeFixture({ systemReduced: true });
  assert.ok(runtime.field);
  assert.equal(runtime.intro.active, true);
  runtime.intro.finish();
});

test('Intro uses AR 9.2 timing and larger skin circles', () => {
  const timeline = timelineFixture();
  assert.ok(Math.abs(timeline.approach - (1200 - 150 * (timeline.approachRate - 5))) < 1e-9);
  assert.equal(timeline.fadeIn, timeline.approach * 2 / 3);
  assert.ok(timeline.diameter > 82);
  const runtime = runtimeFixture();
  const sprites = runtime.field;
  assert.ok(sprites);
  assert.match(runtimeSource, /assets\/whitecat\/hitcircle@2x.png/);
  runtime.intro.finish();
});

test('Boot finish runs every cleanup once and persists completion', () => {
  const fixture = bootFixture();
  let calls = 0;
  fixture.intro.onFinish(() => { calls++; throw new Error('cleanup failure'); });
  fixture.intro.onFinish(() => { calls++; });
  fixture.intro.finish();
  fixture.intro.finish();
  assert.equal(calls, 2);
  assert.equal(fixture.storage.get('nathan-intro-seen'), '1');
  assert.deepEqual(fixture.dispatched, ['site:intro-end']);
  assert.equal(fixture.root.dataset.intro, undefined);
});

test('Enter skips once, suppresses held repeats, and releases suppression on keyup', () => {
  const fixture = bootFixture();
  const keydown = fixture.listeners.window.get('keydown').fn;
  const keyup = fixture.listeners.window.get('keyup').fn;
  const first = inputEvent('Enter');
  keydown(first);
  assert.equal(fixture.intro.active, false);
  assert.equal(first.prevented, true);
  assert.equal(first.stopped, true);
  const repeat = inputEvent('Enter', { repeat: true });
  keydown(repeat);
  assert.equal(repeat.prevented, true);
  assert.equal(repeat.stopped, true);
  const release = inputEvent('Enter');
  keyup(release);
  assert.equal(release.prevented, true);
  assert.equal(release.stopped, true);
  const later = inputEvent('Enter');
  keydown(later);
  assert.equal(later.prevented, false);
});

test('Click is consumed while the intro is active; pagehide and hidden visibility finish it', () => {
  const clickFixture = bootFixture();
  const click = inputEvent('click');
  clickFixture.listeners.window.get('click').fn(click);
  assert.equal(click.prevented, true);
  assert.equal(click.stopped, true);
  assert.equal(clickFixture.intro.active, false);

  const pageFixture = bootFixture();
  pageFixture.listeners.window.get('pagehide').fn();
  assert.equal(pageFixture.intro.active, false);

  const visibilityFixture = bootFixture();
  visibilityFixture.document.hidden = true;
  visibilityFixture.listeners.document.get('visibilitychange')();
  assert.equal(visibilityFixture.intro.active, false);
});

test('Watchdog finishes playback after the recovery deadline', () => {
  const fixture = bootFixture();
  const [id, timer] = [...fixture.timers.entries()][0];
  assert.equal(timer.delay, 4800);
  timer.fn();
  assert.equal(fixture.intro.active, false);
  assert.equal(fixture.timers.has(id), false);
});
