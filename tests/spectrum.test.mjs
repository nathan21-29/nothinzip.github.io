import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function fixture() {
  const frames = new Map(), listeners = new Map();
  let next = 0, paints = 0, strokes = 0, resize;
  const ctx = { setTransform() {}, clearRect() { paints++; }, beginPath() {}, moveTo() {}, lineTo() {}, stroke() { strokes++; } };
  const canvas = { style: {}, setAttribute() {}, getContext: () => ctx };
  const document = {
    hidden: false, getElementById: () => ({ replaceChildren() {} }), createElement: () => canvas,
    addEventListener(name, fn) { listeners.set(name, fn); }
  };
  const window = { SiteIntro: { active: false } };
  vm.runInNewContext(readFileSync(new URL('../spectrum.js', import.meta.url), 'utf8'), {
    window, document, devicePixelRatio: 3,
    ResizeObserver: class { constructor(fn) { resize = fn; } observe() {} },
    requestAnimationFrame(fn) { frames.set(++next, fn); return next; },
    cancelAnimationFrame(id) { frames.delete(id); }
  });
  resize([{ contentRect: { width: 1000 } }]);
  return {
    window, document, canvas, frames, listeners,
    counts: () => ({ paints, strokes }),
    step(time) { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn(time)); }
  };
}

test('Spectrum draws all 120 bars at 30 Hz with bounded backing pixels', () => {
  const f = fixture();
  assert.equal(f.canvas.width, 1200);
  assert.equal(f.frames.size, 0);
  f.window.HomeSpectrum.setActive(true);
  for (let i = 0; i < 120; i++) f.step(i * 1000 / 120);
  assert.deepEqual(f.counts(), { paints: 31, strokes: 31 * 120 });
  assert.equal(f.frames.size, 1);
});

test('Spectrum stops for other screens, reduced motion, hidden tabs, and the intro', () => {
  const f = fixture();
  const spectrum = f.window.HomeSpectrum;
  spectrum.setActive(true);
  f.step(0);
  spectrum.setActive(false);
  assert.equal(f.frames.size, 0);
  spectrum.setMotion(false);
  spectrum.setActive(true);
  assert.equal(f.frames.size, 0);
  spectrum.setMotion(true);
  assert.equal(f.frames.size, 1);
  f.document.hidden = true;
  f.listeners.get('visibilitychange')();
  assert.equal(f.frames.size, 0);
  assert.equal(f.canvas.style.animationPlayState, 'paused');
  f.document.hidden = false;
  f.window.SiteIntro.active = true;
  f.listeners.get('visibilitychange')();
  assert.equal(f.frames.size, 0);
  f.window.SiteIntro.active = false;
  f.listeners.get('site:intro-end')();
  assert.equal(f.frames.size, 1);
  f.step(100000);
  assert.equal(f.canvas.style.animationPlayState, 'running');
  assert.equal(f.counts().paints, 3);
});
