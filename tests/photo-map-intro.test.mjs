import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import { createHash } from 'node:crypto';

const source = readFileSync(new URL('../photo-map-intro.js', import.meta.url), 'utf8');
const data = readFileSync(new URL('../photo-globe-data.js', import.meta.url), 'utf8');

function fixture({ width = 420, height = 440, available = true, dpr = 2, recordPaths = false } = {}) {
  const frames = new Map(), listeners = new Map();
  const map = { dataset: {}, getBoundingClientRect: () => ({ width, height }) };
  const pins = { inert: false };
  let paints = 0, nextFrame = 0, trigCalls = 0;
  const fills = [];
  const paths = [];
  const context = new Proxy({
    ...Object.fromEntries(['beginPath', 'moveTo', 'lineTo', 'arc', 'closePath'].map(name =>
      [name, (...args) => { if (recordPaths) paths.push([name, ...args]); }])),
    clearRect() { paints++; fills.length = 0; paths.length = 0; },
    fill() { fills.push({ color: this.fillStyle, alpha: this.globalAlpha }); },
    createRadialGradient() { return { addColorStop() {} }; }
  }, { get: (target, name) => target[name] ?? (() => {}) });
  const canvas = { hidden: true, width: 1, height: 1, getContext: () => available ? context : null };
  const page = { addEventListener: (type, fn) => listeners.set(`page:${type}`, fn) };
  const elements = { '.photo-map': map, '#photo-globe': canvas, '#photo-map-pins': pins, '#photography-screen': page };
  const document = { hidden: false, querySelector: selector => elements[selector], addEventListener: (type, fn) => listeners.set(type, fn) };
  const window = { devicePixelRatio: dpr, addEventListener: (type, fn) => listeners.set(type, fn) };
  const trackedMath = Object.create(Math);
  for (const name of ['sin', 'cos']) trackedMath[name] = value => { trigCalls++; return Math[name](value); };
  const scope = vm.createContext({ window, document, Math: trackedMath,
    requestAnimationFrame(fn) { frames.set(++nextFrame, fn); return nextFrame; },
    cancelAnimationFrame(id) { frames.delete(id); }
  });
  vm.runInContext(data, scope);
  vm.runInContext(source, scope);
  return { map, pins, canvas, document, frames, listeners, fills, paths, intro: window.PhotoMapIntro,
    get paints() { return paints; },
    get trigCalls() { return trigCalls; },
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

test('Globe paths retain the original coastline, horizon and flattening coordinates', () => {
  // Drawing-command fingerprints captured from the original renderer, before
  // projection reuse. These cover both spherical clipping and local flattening.
  const expected = [
    [0, '7f3300f9442d54fdab077f1be4010dd2560a7350b0d0cfc1d5b6d438d38ef245'],
    [1000, '9ed97206458c7b3a336dbe10726aadcd6e8e81808bb68a21d566061a137c12b1'],
    [1450, 'f1ff131902c8e85621041fb52d9e40107be448749a7581baaed3e570c0d34b50'],
    [1900, 'e5bf5caee1bfdd14b820316d2d1e524c431f07b7cb782d451ca8ddad1375e72f'],
    [2100, '79d6254e46d92a24b9490aa9ff5ccc7c020a2063ab5cd1913ea41dc42723fb93']
  ];
  const view = fixture({ recordPaths: true });
  view.intro.setActive(true);
  for (const [time, hash] of expected) {
    view.tick(time);
    assert.equal(createHash('sha256').update(JSON.stringify(view.paths)).digest('hex'), hash, `${time}ms`);
  }
});

test('Coastline preparation waits until a visible flight and is reused on replay', () => {
  for (const options of [{}, { width: 0, height: 0 }, { available: false }]) {
    const view = fixture(options);
    assert.equal(view.trigCalls, 0, 'loading another screen does not prepare geometry');
    if (options.width === 0 || options.available === false) {
      view.intro.setActive(true);
      assert.equal(view.trigCalls, 0, 'unavailable/hidden maps do not prepare geometry');
    } else {
      view.intro.setMotion(false); view.intro.setActive(true);
      assert.equal(view.trigCalls, 0, 'reduced motion skips preparation too');
    }
  }
  const view = fixture();
  view.intro.setActive(true);
  const firstFlight = view.trigCalls;
  assert.ok(firstFlight > 1000);
  view.intro.setActive(false); view.intro.setActive(true);
  assert.ok(view.trigCalls - firstFlight < firstFlight / 20, 'replay only rotates cached vertices');
});

test('Surrounding continents fade out before the Japan projection unfolds', () => {
  const view = fixture();
  view.intro.setActive(true);
  view.tick(0);
  assert.ok(view.fills.some(fill => fill.color === '#a68aa5' && fill.alpha > 0));
  // The globe-to-local-map blend starts at zoom=.45, about 1417ms.
  for (let time = 1450; time <= 2050; time += 50) {
    view.tick(time);
    assert.ok(!view.fills.some(fill => fill.color === '#a68aa5'), `No world polygons during flattening at ${time}ms`);
    assert.ok(view.fills.some(fill => fill.color.startsWith('rgb(')), 'Japan stays visible');
  }
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
