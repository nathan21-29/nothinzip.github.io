import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const beatmapSource = readFileSync(new URL('../intro-beatmap.js', import.meta.url), 'utf8');
const timelineSource = readFileSync(new URL('../intro-timeline.js', import.meta.url), 'utf8');
const bootSource = readFileSync(new URL('../intro-boot.js', import.meta.url), 'utf8');
const runtimeSource = readFileSync(new URL('../intro.js', import.meta.url), 'utf8');
const hudSource = readFileSync(new URL('../intro-hud.js', import.meta.url), 'utf8');
const starsSource = readFileSync(new URL('../intro-stars.js', import.meta.url), 'utf8');
const gameplaySource = readFileSync(new URL('../intro-gameplay.js', import.meta.url), 'utf8');
const performanceSource = readFileSync(new URL('../intro-performance.js', import.meta.url), 'utf8');

function timelineFixture() {
  const window = {};
  vm.runInNewContext(beatmapSource, { window });
  vm.runInNewContext(timelineSource, { window });
  return window.IntroTimeline;
}

const finalHit = 5622, introEnd = 6662, starsEnd = 8122;

test('Gift excerpt matches all 28 original objects and keeps original timing and numbering', () => {
  const timeline = timelineFixture();
  const source = readFileSync(new URL('../assets/beatmaps/padoru-gift.osu', import.meta.url), 'utf8');
  const rows = source.split('[HitObjects]')[1].trim().split(/\r?\n/).map(line => line.split(','));
  const closing = rows.filter(row => Number(row[2]) >= 26590);
  assert.equal(timeline.objects.length, 28);
  assert.equal(timeline.sliders.length, 5);
  assert.equal(timeline.objects[0].hit, 570);
  assert.equal(timeline.final.hit, finalHit);
  assert.equal(timeline.duration, introEnd);
  assert.equal(timeline.beatmap.end - timeline.beatmap.start, 5052);
  for (const [index, point] of timeline.objects.entries()) {
    const row = closing[index];
    assert.equal(point.hit + timeline.offset, Number(row[2]));
    assert.equal(point.x + 256 + point.stack * timeline.diameter / 20, Number(row[0]));
    assert.equal(point.y + 192 + point.stack * timeline.diameter / 20, Number(row[1]));
    if (point.path) assert.equal(point.curve, row[5]);
  }
  assert.equal(timeline.final.number, 4);
  assert.equal(Math.max(...timeline.objects.map(point => point.number)), 9);
});

test('Cursor hits every circle and every slider head and follows every slider at constant speed', () => {
  const timeline = timelineFixture();
  for (const object of timeline.objects) {
    const cursor = timeline.cursorAt(object.hit);
    assert.ok(Math.hypot(cursor.x - object.x, cursor.y - object.y) < 1e-9);
  }
  const durations = [157.8947387695321, 157.8947387695321, 315.7894775390626, 315.7894775390626, 236.842108154297];
  timeline.sliders.forEach((slider, index) => {
    assert.ok(Math.abs(slider.duration - durations[index]) < 1e-6);
    let previous = timeline.cursorAt(slider.start);
    const steps = 20;
    const distances = [];
    for (let step = 1; step <= steps; step++) {
      const at = timeline.cursorAt(slider.start + slider.duration * step / steps);
      distances.push(Math.hypot(at.x - previous.x, at.y - previous.y));
      previous = at;
    }
    assert.ok(Math.max(...distances) - Math.min(...distances) < 1e-6);
    assert.ok(Math.abs(distances.reduce((sum, distance) => sum + distance, 0) - slider.length) < .1);
  });
  // The first circular arc bends to the right, rather than following its control polygon.
  const first = timeline.sliders[0];
  const middle = first.path.at(.5), end = first.path.at(1);
  assert.ok(Math.hypot(middle.x - (first.x + end.x) / 2, middle.y - (first.y + end.y) / 2) > .1);
});

test('Closing triples stack earlier notes above the slider heads', () => {
  const timeline = timelineFixture();
  for (const time of [26906, 29432]) {
    const index = timeline.objects.findIndex(point => point.time === time);
    assert.deepEqual(Array.from(timeline.objects.slice(index - 2, index + 1), point => point.stack), [2, 1, 0]);
  }
});

test('Cursor position and tangent stay continuous at every hit and slider boundary', () => {
  const timeline = timelineFixture();
  const boundaries = timeline.objects.flatMap(point => point.path ? [point.hit, point.end] : [point.hit]);
  const epsilon = .001;
  for (const time of boundaries) {
    const before = timeline.cursorAt(time - epsilon), at = timeline.cursorAt(time), after = timeline.cursorAt(time + epsilon);
    assert.ok(Math.hypot(before.x - at.x, before.y - at.y) < .02);
    assert.ok(Math.hypot(after.x - at.x, after.y - at.y) < .02);
    assert.ok(Math.hypot((at.x - before.x - after.x + at.x) / epsilon, (at.y - before.y - after.y + at.y) / epsilon) < .01);
  }
  assert.deepEqual(timeline.cursorAt(-100), timeline.cursorAt(0));
  assert.deepEqual(timeline.cursorAt(starsEnd), timeline.final);
});

test('Danser cursor bows between jumps, keeps tight stacks compact, and stays inside the fitted field', () => {
  const timeline = timelineFixture();
  let jumps = 0, dances = 0;
  for (let index = 1; index < timeline.objects.length; index++) {
    const previous = timeline.objects[index - 1], next = timeline.objects[index];
    const from = previous.path ? previous.path.at(1) : previous;
    const dx = next.x - from.x, dy = next.y - from.y;
    const distance = Math.hypot(dx, dy);
    const middle = timeline.cursorAt((previous.end + next.hit) / 2);
    if (distance > 150) {
      jumps++;
      const deviation = Math.abs(dx * (middle.y - from.y) - dy * (middle.x - from.x)) / distance;
      if (deviation > 10) dances++;
    } else if (distance < 10) {
      assert.ok(Math.hypot(middle.x - from.x, middle.y - from.y) < 30, 'stacked taps avoid wide loops');
    }
  }
  assert.ok(jumps > 10 && dances >= jumps * .8, 'most long jumps take a visible curved sweep');
  const padding = timeline.diameter * 2.15 / 2;
  for (let time = 0; time <= finalHit; time += 2) {
    const cursor = timeline.cursorAt(time);
    assert.ok(Math.abs(cursor.x) < 256 + padding && Math.abs(cursor.y) < 192 + padding, 'dance remains within the fitted playfield');
  }
});

test('Full-map no-mod SS carries 159x into the excerpt and finishes at 192x with stable slider scoring', () => {
  const timeline = timelineFixture();
  const ss = timeline.beatmap.ss;
  assert.equal(ss.initial.combo, 159);
  assert.equal(ss.initial.score, 668810);
  assert.equal(ss.maxCombo, 192);
  assert.equal(ss.finalScore, 968510);
  assert.equal(timeline.events.at(-1).combo, 192);
  assert.equal(timeline.events.at(-1).score, 968510);
  assert.equal(timeline.events.filter(event => event.key !== undefined).length, 28);
  assert.equal(timeline.events.filter(event => event.kind === 'tail').length, 5);
  assert.equal(timeline.events.filter(event => event.kind === 'judgement').length, 5);
  let combo = ss.initial.combo, score = ss.initial.score;
  for (const event of timeline.events) {
    score += event.judgement ? 300 + Math.max(0, combo - 1) * 60 : event.value;
    combo += event.comboDelta;
    assert.equal(event.score, score);
    assert.equal(event.combo, combo);
  }
  for (const slider of timeline.sliders) {
    const tail = timeline.events.find(event => event.kind === 'tail' && Math.abs(event.time - (slider.end - 36)) < 1e-6);
    const result = timeline.events.find(event => event.kind === 'judgement' && Math.abs(event.time - slider.end) < 1e-6);
    assert.equal(tail.value, 30);
    assert.equal(result.comboDelta, 0, 'whole-slider judgement must not add a second tail combo');
  }
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
  failCanvas = false, dpr = 1, cores = 8, memory = 8, benchmark = false
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
    bezierCurveTo(...args) { this.operations.push(['bezierCurveTo', ...args]); }
    arc(...args) { this.operations.push(['arc', ...args]); }
    stroke() { this.operations.push(['stroke']); }
    setLineDash(...args) { this.operations.push(['setLineDash', ...args]); }
    save() { (this.stack ??= []).push(this.globalAlpha); this.operations.push(['save']); }
    restore() { this.globalAlpha = this.stack.pop(); this.operations.push(['restore']); }
    translate(...args) { this.operations.push(['translate', ...args]); }
    scale(...args) { this.operations.push(['scale', ...args]); }
    closePath() { this.operations.push(['closePath']); }
    fill() { this.operations.push(['fill']); }
    fillRect(...args) { this.fills.push({ args, opacity: this.globalAlpha }); }
    drawImage(source, sx, sy, sw, sh, x, y, width, height) {
      this.images.push({ source, sx, sy, sw, sh, x, y, width, height, opacity: this.globalAlpha });
    }
  }
  const style = {
    setProperty(key, value) { values.set(key, value); writes.push([key, value, this]); },
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
  const targets = new Map([
    ['#main-cookie', [cookie]], ['.topbar', [inertElements[0]]],
    ['.bottom-bar', [inertElements[2]]], ['.bottom-bar > *', [new Element(), new Element()]]
  ]);
  for (const selector of ['.cookie-pulse', '.intro-logo-surface', '.cookie-facets', '.cookie-word', '.cookie-spectrum', '.cookie-halo', '.world', '.home-tip']) {
    targets.set(selector, [new Element()]);
  }
  for (const element of [...targets.values()].flat()) element.style = Object.create(style);
  inertElements[0].inert = true;
  const root = { dataset: { intro: 'pending' }, style, removeAttribute(name) { if (name === 'data-intro') delete this.dataset.intro; } };
  const body = new Element('body');
  body.classList.contains = name => name === 'reduced-motion' && reduced;
  const document = {
    documentElement: root, body, activeElement: body,
    querySelector(selector) { return selector === '#main-cookie' ? cookie : null; },
    querySelectorAll(selector) {
      if (selector === '.topbar, #main-content, .bottom-bar') return inertElements;
      return selector.split(', ').flatMap(part => targets.get(part) ?? []);
    },
    createElement(tag) { const node = new Element(tag); created.push(node); return node; },
    createElementNS(_ns, tag) { if (failSvg) throw new Error('SVG unavailable'); return new Element(tag); }
  };
  const motionListeners = new Set();
  const motionQuery = { matches: systemReduced, addEventListener(_type, fn) { motionListeners.add(fn); }, removeEventListener(_type, fn) { motionListeners.delete(fn); } };
  class MutationObserverStub { constructor(fn) { this.fn = fn; } observe() {} disconnect() { this.disconnected = true; } }
  class ImageStub { complete = true; naturalWidth = 256; }
  const intro = {
    active: true, busy: true, effectsActive: false, reduced, benchmark, reviewTime: null, cleanups: [],
    settle() { this.busy = false; },
    onFinish(fn) { this.cleanups.push(fn); },
    finish() {
      if (!this.active) return;
      this.active = false;
      for (const fn of this.cleanups.splice(0)) fn();
      root.removeAttribute('data-intro');
      if (!this.effectsActive) this.settle();
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
    console: { warn(...args) { warnings.push(args); }, info() {} }
  };
  vm.runInNewContext(hudSource, context);
  vm.runInNewContext(starsSource, context);
  vm.runInNewContext(gameplaySource, context);
  vm.runInNewContext(performanceSource, context);
  vm.runInNewContext(runtimeSource, context);
  return {
    intro, frames, listeners, motionListeners, warnings, values, writes, attributeWrites, style, root, body, document, targets,
    performance: window.IntroPerformance,
    field: created.find(node => node.className === 'intro-playfield'), inertElements,
    canvas: created.find(node => node.className === 'intro-star-burst'),
    atlas: created.find(node => node.tagName === 'canvas' && !node.className),
    canvases: created.filter(node => node.tagName === 'canvas')
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
  return fixture.canvas.context.images.filter(image => image.source === fixture.atlas).map(image => ({
    ...image, x: image.x + image.width / 2, y: image.y + image.height / 2
  }));
}

test('WhiteCat HUD follows every note and slider hold, then hinges away on the final beat', () => {
  const fixture = runtimeFixture();
  const timeline = timelineFixture();
  const nodes = descendants(fixture.field);
  const byClass = name => nodes.find(node => node.className?.split(' ').includes(name));
  const value = name => byClass(name).getAttribute('data-value');
  const keys = nodes.filter(node => node.className === 'intro-hud-key');
  const boards = nodes.filter(node => node.className?.split(' ').includes('intro-hud-board'));
  runFrame(fixture, 0);
  assert.equal(value('intro-hud-score-value'), '00668810');
  assert.equal(value('intro-hud-combo-value'), '159x');
  assert.equal(value('intro-hud-accuracy'), '100.00%');
  assert.deepEqual(keys.map(key => key.children.find(node => node.className === 'intro-hud-key-count').textContent), ['60', '59', '0', '0']);
  for (const point of timeline.objects) {
    runFrame(fixture, point.hit);
    assert.equal(value('intro-hud-combo-value'), `${timeline.events.filter(event => event.time <= point.hit).at(-1).combo}x`);
    assert.equal(keys[point.key].getAttribute('data-down'), 'true');
    if (point.path) {
      runFrame(fixture, point.hit + point.duration - 10);
      assert.equal(keys[point.key].getAttribute('data-down'), 'true', 'slider stays held until its actual tail');
    }
  }
  runFrame(fixture, finalHit + 180);
  assert.equal(Number(value('intro-hud-score-value')), timeline.events.at(-1).score);
  assert.equal(value('intro-hud-combo-value'), '192x');
  assert.equal(value('intro-hud-accuracy'), '100.00%');
  assert.match(byClass('intro-hud-score').style.transform, /rotateX\(-[\d.]+deg\)/);
  assert.match(byClass('intro-hud-keys').style.transform, /rotateY\(-[\d.]+deg\)/);
  assert.match(byClass('intro-hud-combo').style.transform, /rotateX\([\d.]+deg\)/);
  runFrame(fixture, finalHit + 580);
  assert.ok(boards.every(node => node.style.opacity === '0'));
  fixture.intro.finish();
  assert.equal(fixture.field.removed, true);
});

test('Menu logo stays hidden during the off-centre final note and grows from the centre on that beat', () => {
  const fixture = runtimeFixture();
  const timeline = timelineFixture();
  assert.notEqual(timeline.final.x, 0);
  assert.notEqual(timeline.final.y, 0);
  runFrame(fixture, 0);
  runFrame(fixture, finalHit - 100);
  assert.equal(fixture.values.get('--intro-logo-opacity'), '0');
  runFrame(fixture, finalHit);
  assert.equal(fixture.values.get('--intro-logo-opacity'), '0');
  runFrame(fixture, finalHit + 100);
  assert.equal(fixture.values.get('--intro-logo-opacity'), '1');
  assert.ok(Number(fixture.values.get('--intro-logo-scale')) < 1);
  runFrame(fixture, finalHit + 680);
  assert.equal(fixture.values.get('--intro-logo-scale'), '1');
  assert.ok(!fixture.writes.some(([name]) => /--intro-logo-[xy]/.test(name)));
  fixture.intro.finish();
});

test('Background stays black through gameplay and fades in with the menu', () => {
  const fixture = runtimeFixture();
  runFrame(fixture, 0);
  runFrame(fixture, finalHit);
  assert.equal(fixture.values.get('--intro-background'), '0');
  runFrame(fixture, finalHit + 280);
  assert.equal(fixture.values.get('--intro-background'), '0');
  runFrame(fixture, finalHit + 480);
  const opacity = Number(fixture.values.get('--intro-background'));
  assert.ok(opacity > 0 && opacity < 1);
  assert.equal(fixture.values.get('--intro-background'), fixture.values.get('--intro-profile'));
  runFrame(fixture, finalHit + 1010);
  assert.equal(fixture.values.get('--intro-background'), '1');
  fixture.intro.finish();
  assert.equal(fixture.values.has('--intro-background'), false);
});

test('Final hit flashes softly and sends varied stars inward from both lower edges', () => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const fixture = runtimeFixture(viewport);
    const starCount = viewport.width < 600 ? 72 : 120;
    runFrame(fixture, 0);
    assert.equal(burstFrame(fixture, finalHit - 1).length, 0);
    assert.equal(fixture.canvas.context.fills.length, 0);
    burstFrame(fixture, finalHit + 45);
    assert.equal(fixture.canvas.context.fills[0].opacity, .22);
    const emitted = [];
    for (const time of [finalHit + 100, finalHit + 200, finalHit + 300, finalHit + 400]) {
      emitted.push(burstFrame(fixture, time).length);
    }
    const batches = emitted.map((count, index) => count - (emitted[index - 1] ?? 0));
    // Some small-screen stars are still outside the viewport immediately after launch.
    assert.ok(emitted[1] > emitted[3] - emitted[1] && batches[1] > batches[2] && batches[2] > batches[3], 'visible emission should taper after the stars enter the viewport');
    const stars = burstFrame(fixture, finalHit + 680);
    assert.equal(stars.length, starCount);
    assert.ok(new Set(stars.map(star => star.opacity)).size > 10);
    assert.ok(new Set(stars.map(star => star.width)).size > 10);
    const left = stars.slice(0, starCount / 2), right = stars.slice(starCount / 2);
    assert.ok(left.every(star => star.x < viewport.width / 2));
    assert.ok(right.every(star => star.x > viewport.width / 2));
    assert.ok(stars.every(star => star.y < viewport.height));
    assert.ok(burstFrame(fixture, finalHit + 1010).length > 0);
    assert.equal(fixture.canvas.context.fills.length, 0);
    runFrame(fixture, introEnd);
    assert.equal(fixture.intro.active, false);
    assert.ok(fixture.inertElements.slice(1).every(element => !element.inert));
    const falling = burstFrame(fixture, finalHit + 1480);
    const fallen = burstFrame(fixture, finalHit + 1630);
    assert.ok(fallen.some(star => star.x > 0 && star.x < viewport.width * .025), 'falling stars should reach the left edge');
    assert.ok(fallen.some(star => star.x < viewport.width && star.x > viewport.width * .975), 'falling stars should reach the right edge');
    assert.ok(fallen.reduce((sum, star) => sum + star.y, 0) / fallen.length > falling.reduce((sum, star) => sum + star.y, 0) / falling.length, 'stars should fall downward under gravity');
    runFrame(fixture, starsEnd);
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
    const initialSize = [fixture.canvas.width, fixture.canvas.height];
    runFrame(fixture, 0);
    if (options.slow) for (let time = 33; time < finalHit; time += 33) runFrame(fixture, time);
    const stars = burstFrame(fixture, finalHit + 680);
    assert.equal(stars.length, options.width ? 48 : 72);
    assert.ok(fixture.canvas.width * fixture.canvas.height <= (options.slow ? 2000000 : 1000000));
    assert.deepEqual([fixture.canvas.width, fixture.canvas.height], initialSize, 'quality adaptation must not reallocate the visible canvas');
    const width = options.width ?? 1440;
    assert.ok(stars.some(star => star.x < width * .025));
    assert.ok(stars.some(star => star.x > width * .975));
    assert.ok(stars.some(star => star.x > width * .1 && star.x < width * .4));
    assert.ok(stars.some(star => star.x < width * .9 && star.x > width * .6));
    fixture.intro.finish();
  }
});

test('Star tail reuses cached sprites without DOM writes or fresh paths', () => {
  const fixture = runtimeFixture();
  const paint = fixture.canvas.context;
  const atlasOperations = fixture.atlas.context.operations.length;
  runFrame(fixture, 0);
  runFrame(fixture, 2600);
  assert.ok(paint.images.some(image => image.source.src?.includes('whitecat/')), 'gameplay uses the same canvas before the burst');
  burstFrame(fixture, introEnd); // interactive menu; only the star tail remains
  const writes = fixture.attributeWrites.length;
  const operations = paint.operations.length;
  const stars = burstFrame(fixture, introEnd + 190);
  assert.ok(stars.length > 0);
  assert.equal(fixture.attributeWrites.length, writes);
  assert.equal(fixture.atlas.context.operations.length, atlasOperations);
  assert.deepEqual(paint.operations.slice(operations).map(op => op[0]), ['setTransform', 'clearRect']);
  assert.equal(descendants(fixture.field).filter(node => node.tagName === 'polygon').length, 0);
  // Hidden tabs promptly release the tail and both backing stores.
  fixture.document.hidden = true;
  runFrame(fixture, introEnd + 240);
  assert.equal(fixture.field.removed, true);
  assert.equal(fixture.canvas.width, 0);
  assert.equal(fixture.atlas.width, 0);
  assert.equal(fixture.frames.size, 0);
});

test('Unavailable canvas immediately restores the usable menu', () => {
  const fixture = runtimeFixture({ failCanvas: true });
  assert.equal(fixture.intro.active, false);
  assert.ok(fixture.inertElements.slice(1).every(element => !element.inert));
  assert.equal(fixture.field.removed, true);
  assert.equal(fixture.frames.size, 0);
  assert.deepEqual(fixture.warnings, []);
});

test('Runtime renders through the final cookie morph and restores inert state', () => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 568 }]) {
  const fixture = runtimeFixture(viewport);
  assert.ok(fixture.field);
  assert.ok(fixture.inertElements.every(element => element.inert));
  runFrame(fixture, 100); // establish the clock origin
  runFrame(fixture, finalHit + 880); // elapsed 3600ms: the logo has reached its final pose
  assert.equal(fixture.values.get('--intro-logo-scale'), '1');
  assert.equal(fixture.values.get('--intro-number'), '0');
  assert.equal(fixture.values.get('--intro-logo-opacity'), '1');
  runFrame(fixture, introEnd + 100); // elapsed 3860ms
  assert.equal(fixture.intro.active, false);
  assert.ok(fixture.inertElements[0].inert);
  assert.ok(fixture.inertElements.slice(1).every(element => !element.inert));
  assert.notEqual(fixture.field.removed, true);
  runFrame(fixture, starsEnd + 100); // remaining stars finish falling after the menu becomes interactive
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
  assert.equal(fixture.intro.busy, false);
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
  const localReplay = bootFixture({ hostname: 'localhost', search: '?intro=replay&introAt=99999', seen: true });
  assert.equal(localReplay.intro.active, true);
  assert.equal(localReplay.intro.reviewTime, starsEnd);
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
  assert.deepEqual(fixture.dispatched, ['site:intro-end', 'site:intro-idle']);
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
  assert.match(gameplaySource, /image\('hitcircle@2x'\)/);
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
  assert.deepEqual(fixture.dispatched, ['site:intro-end', 'site:intro-idle']);
  assert.equal(fixture.root.dataset.intro, undefined);
});

test('Background work waits for the falling-star tail, while skips settle immediately', () => {
  const boot = bootFixture();
  boot.intro.effectsActive = true;
  boot.intro.finish();
  assert.equal(boot.intro.busy, true);
  assert.deepEqual(boot.dispatched, ['site:intro-end']);
  boot.intro.effectsActive = false;
  boot.intro.settle();
  boot.intro.settle();
  assert.equal(boot.intro.busy, false);
  assert.deepEqual(boot.dispatched, ['site:intro-end', 'site:intro-idle']);

  const runtime = runtimeFixture();
  runFrame(runtime, 0);
  runFrame(runtime, introEnd);
  assert.equal(runtime.intro.active, false);
  assert.equal(runtime.intro.busy, true);
  runFrame(runtime, starsEnd);
  assert.equal(runtime.intro.busy, false);
});

test('Logo morph styles stay local and score updates use one glyph texture', () => {
  const fixture = runtimeFixture();
  runFrame(fixture, 0);
  runFrame(fixture, 650);
  const digits = descendants(fixture.field).filter(node => node.className === 'intro-hud-digit');
  assert.ok(digits.length > 0);
  assert.ok(digits.every(node => node.tagName === 'span' && node.src === undefined));
  assert.ok(digits.some(node => node.style.backgroundPosition === '-360px 0'), 'combo multiplier uses the x glyph');
  runFrame(fixture, finalHit + 280);
  assert.ok(fixture.writes.length > 0);
  assert.ok(fixture.writes.every(([, , owner]) => owner !== fixture.root.style), 'no per-frame variable invalidates the whole site');
  assert.ok(!fixture.writes.some(([name]) => /--intro-(rim|fill)$/.test(name)), 'the morph does not repaint changing shadows or backgrounds');
  fixture.intro.finish();
  assert.equal(fixture.values.size, 0, 'all localized overrides are removed on skip');
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
  assert.equal(timer.delay, 9000);
  timer.fn();
  assert.equal(fixture.intro.active, false);
  assert.equal(fixture.timers.has(id), false);
});

test('Gameplay caps render work at 75 fps on a 240 Hz display without changing duration', () => {
  const fixture = runtimeFixture();
  const paint = fixture.canvas.context;
  const clears = () => paint.operations.filter(op => op[0] === 'clearRect').length;
  const before = clears();
  for (let frame = 0; frame <= 240; frame++) runFrame(fixture, frame * 1000 / 240);
  assert.ok(clears() - before >= 75 && clears() - before <= 76);
  const operations = paint.operations.length;
  const writes = fixture.writes.length;
  runFrame(fixture, 1001);
  assert.equal(paint.operations.length, operations, 'intermediate refreshes do not render');
  assert.equal(fixture.writes.length, writes, 'intermediate refreshes do not update the logo');
  runFrame(fixture, introEnd);
  assert.equal(fixture.intro.active, false, 'the last pose and release meet the elapsed-time deadline');
  assert.equal(descendants(fixture.field).filter(node => node.tagName === 'canvas').length, 1);
  assert.equal(descendants(fixture.field).some(node => node.tagName === 'g'), false);
  const tailStart = clears();
  for (let frame = 1; frame <= 240; frame++) runFrame(fixture, introEnd + frame * 1000 / 240);
  assert.equal(clears() - tailStart, 50, 'star tail paints at 50 fps');
  runFrame(fixture, starsEnd);
  assert.equal(fixture.frames.size, 0);
  assert.ok(fixture.canvases.every(canvas => canvas.width === 0 && canvas.height === 0), 'all backing stores are released');
  assert.deepEqual(fixture.warnings, []);
});

test('Gameplay caches all five sliders once, culls expired notes, and releases every track', () => {
  const fixture = runtimeFixture();
  const timeline = timelineFixture();
  const paint = fixture.canvas.context;
  const tracks = fixture.canvases.filter(canvas => canvas !== fixture.canvas && canvas !== fixture.atlas);
  assert.equal(tracks.length, 5);
  const counts = tracks.map(track => track.context.operations.length);
  runFrame(fixture, 0);
  for (const [index, slider] of timeline.sliders.entries()) {
    burstFrame(fixture, slider.hit + slider.duration / 2);
    assert.ok(paint.images.some(image => image.source === tracks[index]), 'uses its cached circular arc');
    assert.equal(tracks[index].context.operations.length, counts[index]);
  }
  burstFrame(fixture, finalHit + 380);
  assert.ok(paint.images.every(image => image.source === fixture.atlas), 'only stars remain after gameplay disappears');
  fixture.intro.finish();
  assert.ok(tracks.every(track => track.width === 0 && track.height === 0));
});

test('Stable gameplay does not rewrite logo styles or unchanged HUD values', () => {
  const fixture = runtimeFixture();
  runFrame(fixture, 0);
  runFrame(fixture, 200);
  const writes = fixture.writes.length;
  const nodes = descendants(fixture.field);
  const hudKeys = nodes.filter(node => node.className === 'intro-hud-key');
  const attributes = fixture.attributeWrites.filter(([node]) => hudKeys.includes(node)).length;
  runFrame(fixture, 300);
  assert.equal(fixture.writes.length, writes);
  assert.equal(fixture.attributeWrites.filter(([node]) => hudKeys.includes(node)).length, attributes);
  fixture.intro.finish();
});

test('Benchmarks report average fps and slowest-one-percent frame times accurately', () => {
  const fixture = runtimeFixture();
  const summarize = fixture.performance.summarize;
  const steady = summarize(Array(300).fill(1000 / 60));
  assert.ok(Math.abs(steady.averageFps - 60) < 1e-9);
  assert.ok(Math.abs(steady.low1PercentFps - 60) < 1e-9);
  const stalled = summarize([...Array(198).fill(10), 40, 60]);
  assert.equal(stalled.averageFps, 200000 / 2080);
  assert.equal(stalled.low1PercentFps, 20);
  assert.equal(summarize([]).averageFps, null);
  assert.equal(summarize([]).low1PercentFps, null);
  assert.equal(summarize([25]).low1PercentFps, 40);
  fixture.intro.finish();
  assert.equal(fixture.performance.lastResult, undefined, 'normal playback does not collect metrics');
});

test('Local benchmarks measure painted frames in both phases and label interrupted runs', () => {
  const fixture = runtimeFixture({ benchmark: true });
  for (let frame = 0; frame <= 850; frame++) {
    if (!fixture.frames.size) break;
    runFrame(fixture, frame * 10);
  }
  const result = fixture.performance.lastResult;
  assert.equal(result.status, 'completed');
  assert.ok(result.phases.gameplay.averageFps > 74 && result.phases.gameplay.averageFps < 76);
  assert.equal(result.phases.gameplay.low1PercentFps, 50, 'skipped display refreshes remain in the measurements');
  assert.ok(result.phases.stars.averageFps > 49 && result.phases.stars.averageFps < 51);
  assert.equal(result.phases.stars.low1PercentFps, 50);
  const skipped = runtimeFixture({ benchmark: true });
  runFrame(skipped, 0);
  runFrame(skipped, 40);
  skipped.intro.finish();
  assert.equal(skipped.performance.lastResult.status, 'interrupted');
  assert.equal(skipped.performance.lastResult.phases.gameplay.averageFps, 25);
});

test('Benchmarking requires an explicit local replay without a static review time', () => {
  assert.equal(bootFixture({ search: '?intro=replay&introPerf=1' }).intro.benchmark, false);
  assert.equal(bootFixture({ hostname: 'localhost', search: '?introPerf=1' }).intro.benchmark, false);
  assert.equal(bootFixture({ hostname: 'localhost', search: '?intro=replay&introPerf=1' }).intro.benchmark, true);
  assert.equal(bootFixture({ hostname: 'localhost', search: '?intro=replay&introPerf=1&introAt=1820' }).intro.benchmark, false);
});
