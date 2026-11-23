import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const timelineSource = readFileSync(new URL('../intro-timeline.js', import.meta.url), 'utf8');
const bootSource = readFileSync(new URL('../intro-boot.js', import.meta.url), 'utf8');
const runtimeSource = readFileSync(new URL('../intro.js', import.meta.url), 'utf8');

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

function runtimeFixture({ width = 1440, height = 900, reduced = false, systemReduced = false, failSvg = false, offscreen = false } = {}) {
  const listeners = new Map();
  const frames = new Map();
  const created = [];
  const warnings = [];
  let nextFrame = 1;
  const values = new Map();
  const writes = [];
  const style = {
    setProperty(key, value) { values.set(key, value); writes.push([key, value]); },
    removeProperty(key) { values.delete(key); },
    getPropertyValue(key) { return values.get(key) ?? ''; },
    [Symbol.iterator]() { return values.keys(); }
  };
  class Element {
    constructor(tag = 'div') { this.tagName = tag; this.attributes = new Map(); this.children = []; this.style = {}; this.inert = false; this.classList = { contains: name => this.classes?.has(name) ?? false }; }
    setAttribute(key, value) { this.attributes.set(key, String(value)); }
    getAttribute(key) { return this.attributes.get(key); }
    append(child) { this.children.push(child); child.parent = this; }
    remove() { this.removed = true; if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); }
    blur() { this.blurred = true; }
    closest(selector) { return selector === '.cookie-anchor' ? anchor : null; }
    getBoundingClientRect() { return this.rect ?? { left: 620, top: 300, width: 200, height: 200 }; }
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
  vm.runInNewContext(runtimeSource, context);
  return { intro, frames, listeners, motionListeners, warnings, values, writes, style, root, body, field: created.find(node => node.className === 'intro-playfield'), dim: created.find(node => node.className === 'intro-dim'), inertElements };
}

function runFrame(fixture, timestamp) {
  const entry = fixture.frames.entries().next().value;
  assert.ok(entry, 'expected a pending animation frame');
  fixture.frames.delete(entry[0]);
  entry[1](timestamp);
}

test('Runtime renders through the final cookie morph and restores inert state', () => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 568 }]) {
  const fixture = runtimeFixture(viewport);
  assert.ok(fixture.field);
  assert.ok(fixture.dim);
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
  assert.equal(fixture.field.removed, true);
  assert.equal(fixture.dim.removed, true);
  assert.equal([...fixture.style].some(key => key.startsWith('--intro-')), false);
  assert.deepEqual(fixture.warnings, []);
  }
});

test('Short landscape windows with offscreen logos remain usable', () => {
  const fixture = runtimeFixture({ width: 844, height: 390, offscreen: true });
  assert.equal(fixture.intro.active, false);
  assert.equal(fixture.field, undefined);
  assert.equal(fixture.dim, undefined);
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
  assert.equal(fixture.dim.removed, true);
  assert.ok(fixture.inertElements[0].inert);
  assert.ok(fixture.inertElements.slice(1).every(element => !element.inert));
});

test('Runtime failures restore the page instead of leaving it hidden', () => {
  const fixture = runtimeFixture({ failSvg: true });
  assert.equal(fixture.intro.active, false);
  assert.equal(fixture.warnings.length, 1);
  assert.ok(fixture.inertElements[0].inert);
  assert.ok(fixture.inertElements.slice(1).every(element => !element.inert));
  assert.equal(fixture.dim?.removed, true);
});

test('Runtime resize finishes safely at desktop and mobile viewport sizes', () => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const fixture = runtimeFixture(viewport);
    assert.ok(fixture.field);
    fixture.listeners.get('resize')();
    assert.equal(fixture.intro.active, false);
    assert.equal(fixture.field.removed, true);
    assert.equal(fixture.dim.removed, true);
    assert.ok(fixture.inertElements.slice(1).every(element => !element.inert));
    assert.deepEqual(fixture.warnings, []);
  }
});

test('Boot eligibility honors session storage, deep links, replay, and production safety', () => {
  assert.equal(bootFixture({ seen: true }).intro.active, false);
  assert.equal(bootFixture({ hash: '#about' }).intro.active, false);
  assert.equal(bootFixture({ search: '?intro=replay', seen: true }).intro.active, false);
  const localReplay = bootFixture({ hostname: 'localhost', search: '?intro=replay&introAt=4100', seen: true });
  assert.equal(localReplay.intro.active, true);
  assert.equal(localReplay.intro.reviewTime, 3860);
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
