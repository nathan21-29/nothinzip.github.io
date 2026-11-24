import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../cursor.js', import.meta.url), 'utf8');

function fixture({ reduced = false, fine = true } = {}) {
  let now = 0;
  let nextFrame = 1;
  const frames = new Map();
  let nextTimer = 1;
  const timers = new Map();
  const paints = [];
  const clears = [];
  const events = () => ({
    listeners: new Map(),
    addEventListener(type, fn) {
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      this.listeners.get(type).push(fn);
    },
    emit(type, event = {}) { for (const fn of this.listeners.get(type) || []) fn(event); }
  });
  const root = { ...events(), classList: { toggle() {} } };
  const context = {
    globalAlpha: 1,
    setTransform() {},
    clearRect(...rect) { clears.push(rect); },
    drawImage(image, ...rect) { paints.push({ src: image.src, rect, alpha: this.globalAlpha }); }
  };
  const attributes = new Set();
  const canvas = {
    getContext: () => context,
    setAttribute(name) { attributes.add(name); },
    hasAttribute: name => attributes.has(name)
  };
  const document = {
    ...events(), documentElement: root, hidden: false,
    currentScript: { src: 'https://example.com/cursor.js' },
    body: { append() {}, classList: { contains: () => reduced } },
    createElement: () => canvas
  };
  const window = { ...events(), SiteIntro: { active: false } };
  const images = [];
  class Image {
    constructor() { images.push(this); this.complete = true; this.naturalWidth = 128; }
  }
  vm.runInNewContext(source, {
    document, window, Image, URL, devicePixelRatio: 1.25, innerWidth: 1440, innerHeight: 900,
    matchMedia: () => ({ ...events(), matches: fine }),
    MutationObserver: class { observe() {} },
    performance: { now: () => now },
    setTimeout(fn, delay) { const id = nextTimer++; timers.set(id, { fn, at: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    requestAnimationFrame(fn) { const id = nextFrame++; frames.set(id, fn); return id; },
    cancelAnimationFrame(id) { frames.delete(id); }
  });
  images[0].onload();
  function move(time, x = time, y = 300, extra = {}) {
    now = time;
    document.emit('pointermove', { pointerType: 'mouse', buttons: 0, clientX: x, clientY: y, target: {}, ...extra });
  }
  function tick(time) {
    now = time;
    for (const [id, timer] of [...timers]) {
      if (timer.at <= now) { timers.delete(id); timer.fn(); }
    }
    const pending = [...frames.values()];
    frames.clear();
    for (const fn of pending) fn(time);
  }
  return { move, tick, frames, timers, paints, clears, document, root, window };
}

const trails = view => view.paints.filter(paint => paint.src.endsWith('cursortrail@2x.png'));
const cursors = view => view.paints.filter(paint => !paint.src.endsWith('cursortrail@2x.png'));

test('High-frequency pointer events paint once per frame at the latest cursor position', () => {
  const view = fixture();
  for (let time = 0; time <= 16; time++) view.move(time, 100 + time);
  assert.equal(view.paints.length, 0);
  assert.equal(view.frames.size, 1);
  view.tick(17);
  assert.equal(cursors(view).length, 1);
  assert.equal(cursors(view)[0].rect[0], 116 - 45);
});

test('Trail snapshots use 30 Hz sampling and skip missed samples across a fast flick', () => {
  const view = fixture();
  for (let time = 0; time <= 100; time++) view.move(time, 100 + time);
  view.tick(100);
  assert.equal(trails(view).length, 4);
  const centers = trails(view).map(paint => Math.round(paint.rect[0] + paint.rect[2] / 2));
  assert.deepEqual(centers, [100, 134, 167, 200]);
  view.paints.length = 0;
  view.move(500, 1200);
  view.tick(500);
  assert.equal(trails(view).length, 1);
  assert.equal(trails(view)[0].rect[0], 1200 - 22.4);
});

test('Trail fades completely, clears old cursor bounds, and stops requesting idle frames', () => {
  const view = fixture();
  view.move(0, 200);
  view.tick(0);
  view.move(34, 240);
  view.tick(34);
  const [left, top, width, height] = view.clears.at(-1);
  assert.ok(left <= 155 && top <= 255 && left + width >= 245 && top + height >= 345);
  assert.ok(width < 150 && height < 150, 'clears the previous sprites, not the viewport');
  view.paints.length = 0;
  view.tick(185);
  assert.equal(trails(view).length, 0);
  assert.equal(view.frames.size, 0);
  assert.equal(cursors(view).length, 1);
});

test('Press animation shares the cursor frame and resets cleanly when focus leaves', () => {
  const view = fixture();
  view.move(0, 200);
  view.document.emit('pointerdown', { pointerType: 'mouse', button: 0 });
  assert.equal(view.frames.size, 1);
  view.tick(100);
  assert.equal(cursors(view).length, 1);
  assert.ok(cursors(view)[0].rect[2] > 90);
  view.window.emit('blur');
  assert.equal(view.frames.size, 0);
  view.paints.length = 0;
  view.move(300, 250);
  view.tick(300);
  assert.equal(cursors(view).at(-1).rect[2], 90);
});

test('Reduced motion keeps the cursor responsive without trail or an idle loop', () => {
  const view = fixture({ reduced: true });
  view.move(0, 200);
  view.move(34, 250);
  view.tick(34);
  assert.equal(trails(view).length, 0);
  assert.equal(cursors(view).length, 1);
  assert.equal(view.frames.size, 0);
});

test('Text inputs and pointer leave clear the skin cursor without continuing animation', () => {
  const view = fixture();
  view.move(0, 200);
  view.tick(0);
  view.paints.length = 0;
  view.move(10, 250, 300, { target: { closest: () => ({}) } });
  assert.equal(view.paints.length, 0);
  assert.equal(view.frames.size, 0);
  view.move(20, 300);
  view.tick(20);
  view.paints.length = 0;
  view.root.emit('pointerleave');
  assert.equal(view.paints.length, 0);
  assert.equal(view.frames.size, 0);
});

test('Startup owns its cursor and regular drawing resumes when startup ends', () => {
  const view = fixture();
  view.window.SiteIntro.active = true;
  view.move(0, 200);
  assert.equal(view.frames.size, 0);
  assert.equal(view.paints.length, 0);
  view.window.SiteIntro.active = false;
  view.document.emit('site:intro-end');
  assert.equal(cursors(view).length, 1);
});

test('Cursor waits 15 seconds, shrinks for 500 ms, and stops rendering when hidden', () => {
  const view = fixture();
  view.move(0, 200);
  view.tick(200);
  view.tick(14999);
  assert.equal(cursors(view).at(-1).rect[2], 90);
  assert.equal(view.frames.size, 0, 'no continuous frames during the idle wait');
  view.tick(15000);
  assert.equal(cursors(view).at(-1).rect[2], 90);
  view.tick(15250);
  assert.equal(cursors(view).at(-1).rect[2], 45);
  view.paints.length = 0;
  view.tick(15500);
  assert.equal(view.paints.length, 0);
  assert.equal(view.frames.size, 0);
  assert.equal(view.timers.size, 0);
});

test('Movement grows the hidden cursor and trail back over 150 ms without restarting the growth', () => {
  const view = fixture();
  view.move(0, 200); view.tick(200); view.tick(15500);
  view.paints.length = 0;
  view.move(16000, 250); view.tick(16000);
  assert.equal(view.paints.length, 0, 'growth starts at zero size');
  view.move(16025, 270); view.tick(16025);
  assert.ok(trails(view).at(-1).rect[2] < 44.8, 'the trail grows with the cursor');
  view.move(16075, 300); view.tick(16075);
  assert.equal(cursors(view).at(-1).rect[2], 45);
  view.move(16150, 350); view.tick(16150);
  assert.equal(cursors(view).at(-1).rect[2], 90);
  view.tick(16301);
  assert.equal(view.frames.size, 0);
});

test('Movement partway through shrinking reverses smoothly from the current size', () => {
  const view = fixture();
  view.move(0, 200); view.tick(200); view.tick(15250);
  assert.equal(cursors(view).at(-1).rect[2], 45);
  view.move(15250, 250); view.tick(15250);
  assert.equal(cursors(view).at(-1).rect[2], 45, 'no size jump at reversal');
  view.tick(15325);
  assert.equal(cursors(view).at(-1).rect[2], 67.5);
  view.tick(15400);
  assert.equal(cursors(view).at(-1).rect[2], 90);
});

test('Only real movement postpones hiding, and leaving cancels the idle timer', () => {
  const view = fixture();
  view.move(0, 200); view.tick(200);
  view.move(10000, 250); view.tick(10200);
  view.tick(15000);
  assert.equal(view.frames.size, 0, 'the old deadline only reschedules a timeout');
  view.move(24000, 250); view.tick(24000);
  view.tick(25250);
  assert.equal(cursors(view).at(-1).rect[2], 45, 'same-position events do not reset inactivity');
  view.root.emit('pointerleave');
  assert.equal(view.frames.size, 0);
  assert.equal(view.timers.size, 0);
});
