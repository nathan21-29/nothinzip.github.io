import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../photo-map-intro.js', import.meta.url), 'utf8');
const data = readFileSync(new URL('../photo-globe-data.js', import.meta.url), 'utf8');

function fixture({ width = 420, height = 440, available = true, dpr = 2 } = {}) {
  const frames = new Map(), listeners = new Map();
  const map = { dataset: {}, getBoundingClientRect: () => ({ width, height }) };
  const pins = { inert: false };
  let paints = 0, nextFrame = 0;
  const context = new Proxy({
    clearRect() { paints++; },
    createRadialGradient() { return { addColorStop() {} }; }
  }, { get: (target, name) => target[name] ?? (() => {}) });
  const canvas = { hidden: true, width: 1, height: 1, getContext: () => available ? context : null };
  const page = { addEventListener: (type, fn) => listeners.set(`page:${type}`, fn) };
  const elements = { '.photo-map': map, '#photo-globe': canvas, '#photo-map-pins': pins, '#photography-screen': page };
  const document = { hidden: false, querySelector: selector => elements[selector], addEventListener: (type, fn) => listeners.set(type, fn) };
  const window = { devicePixelRatio: dpr, addEventListener: (type, fn) => listeners.set(type, fn) };
  const scope = vm.createContext({ window, document,
    requestAnimationFrame(fn) { frames.set(++nextFrame, fn); return nextFrame; },
    cancelAnimationFrame(id) { frames.delete(id); }
  });
  vm.runInContext(data, scope);
  vm.runInContext(source, scope);
  return { map, pins, canvas, document, frames, listeners, intro: window.PhotoMapIntro,
    get paints() { return paints; },
    tick(time) { const queued = [...frames.values()]; frames.clear(); queued.forEach(fn => fn(time)); }
  };
}

test('Globe spins, zooms and hands the map back with no remaining render loop', () => {
  const view = fixture();
  assert.equal(view.paints, 0, 'other screens do not paint the globe');
  view.intro.setActive(true);
  assert.equal(view.map.dataset.globeIntro, 'spinning');
  assert.equal(view.pins.inert, true);
  assert.equal(view.canvas.hidden, false);
  view.tick(0);
  view.tick(1000);
  assert.equal(view.map.dataset.globeIntro, 'zooming');
  view.tick(1900);
  assert.equal(view.map.dataset.globeIntro, 'landing');
  view.tick(2200);
  assert.equal(view.map.dataset.globeIntro, undefined);
  assert.equal(view.pins.inert, false);
  assert.equal(view.canvas.hidden, true);
  assert.equal(view.canvas.width, 1);
  assert.equal(view.frames.size, 0);
  view.intro.setActive(false);
  view.intro.setActive(true);
  assert.equal(view.canvas.hidden, false, 'opening the gallery again replays the flight');
});

test('Globe caps paint work at 30 fps and bounds high-DPI backing dimensions', () => {
  const view = fixture({ width: 900, height: 940, dpr: 4 });
  view.intro.setActive(true);
  for (let time = 0; time < 1000; time += 1000 / 240) view.tick(time);
  assert.ok(view.paints <= 32, `${view.paints} paints in one second`);
  assert.ok(Math.max(view.canvas.width, view.canvas.height) <= 850);
  view.intro.setActive(false);
  assert.equal(view.frames.size, 0);
  assert.equal(view.pins.inert, false);
});

test('Reduced motion, hidden maps and unavailable canvas keep the regular map usable', () => {
  for (const options of [{ width: 0, height: 0 }, { available: false }]) {
    const view = fixture(options);
    view.intro.setActive(true);
    assert.equal(view.frames.size, 0);
    assert.equal(view.canvas.hidden, true);
    assert.equal(view.pins.inert, false);
  }
  const view = fixture();
  view.intro.setMotion(false);
  view.intro.setActive(true);
  assert.equal(view.paints, 0);
  assert.equal(view.map.dataset.globeIntro, undefined);
});

test('Resize, hidden tabs, leaving and early location selections release the intro', () => {
  for (const event of ['resize', 'pagehide', 'visibilitychange', 'page:click']) {
    const view = fixture();
    view.intro.setActive(true);
    if (event === 'visibilitychange') view.document.hidden = true;
    view.listeners.get(event)({ target: { closest: () => ({}) } });
    assert.equal(view.canvas.hidden, true, event);
    assert.equal(view.pins.inert, false, event);
    assert.equal(view.frames.size, 0, event);
  }
  const view = fixture();
  view.intro.setActive(true);
  view.intro.setMotion(false);
  assert.equal(view.frames.size, 0);
  assert.equal(view.map.dataset.globeIntro, undefined);
});
