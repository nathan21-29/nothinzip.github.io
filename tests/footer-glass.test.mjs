import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../footer-glass.js', import.meta.url), 'utf8');

function fixture({ reduced = false, fine = true, width = 40, pill = false } = {}) {
  let now = 0, nextFrame = 0, lens, clip;
  const frames = new Map();
  const observers = [];
  const events = () => ({
    listeners: {},
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
    emit(type, event = {}) { for (const fn of this.listeners[type] || []) fn(event); }
  });
  const buttons = (pill ? [0, width, width * 2] : [20, 80, 140]).map(left => ({
    disabled: false, closest: () => null, getClientRects: () => [1],
    getBoundingClientRect: () => ({ left: left + (pill ? 101 : 100), top: pill ? 201 : 204, width, height: pill ? 56 : 40 }),
    matches: () => true
  }));
  const group = {
    ...events(), clientLeft: 1, clientTop: 1, clientWidth: width * 3,
    prepend(node) { lens = node.child || node; if (node.child) clip = node; }, classList: { add() {} },
    matches: () => pill,
    querySelectorAll: () => buttons,
    getBoundingClientRect: () => ({ left: 100, top: 200 }),
    contains: node => buttons.includes(node)
  };
  const document = {
    ...events(), activeElement: null,
    body: { classList: { contains: () => reduced } },
    querySelectorAll: () => [group],
    createElement: () => ({ style: {}, setAttribute() {}, append(node) { this.child = node; } })
  };
  const morphTargets = [];
  const window = { ...events(), SiteCursor: { setMorphTarget(position) { morphTargets.push(position); } } };
  vm.runInNewContext(source, {
    document, window, matchMedia: () => ({ ...events(), matches: fine }),
    performance: { now: () => now },
    requestAnimationFrame(fn) { const id = ++nextFrame; frames.set(id, fn); return id; },
    cancelAnimationFrame: id => frames.delete(id),
    MutationObserver: class { constructor(fn) { observers.push(fn); } observe() {} }
  });
  function move(x, button = null, type = 'mouse', y = 224) {
    group.emit('pointermove', { clientX: 100 + x, clientY: y, pointerType: type,
      target: { closest: () => button === null ? null : buttons[button] } });
  }
  function tick() {
    now += 1000 / 60;
    const pending = [...frames.values()]; frames.clear();
    pending.forEach(fn => fn(now));
  }
  function settle() {
    for (let i = 0; frames.size && i < 240; i++) tick();
    assert.equal(frames.size, 0, 'animation must release its frame loop');
  }
  const position = () => lens.style.transform.match(/translate3d\(([-.\d]+)px,([-.\d]+)px/).slice(1).map(Number);
  return { group, window, buttons, document, lens, clip, frames, observers, move, tick, settle, position, morphTargets };
}

test('Glass grows from the entry coordinate, tracks at 0.1x, and stops at rest', () => {
  const f = fixture();
  f.move(22, 0);
  assert.deepEqual(f.position(), [21, 23]);
  assert.equal(f.lens.style.width, '2.00px');
  f.settle();
  const start = f.position()[0];
  f.move(52, 0); f.settle();
  assert.equal(Number((f.position()[0] - start).toFixed(2)), 3);
  assert.equal(f.lens.style.width, '68.00px');
});

test('Vertical cursor position never moves the lens, including its entry seed', () => {
  const f = fixture();
  f.move(40, 0, 'mouse', 205);
  assert.equal(f.position()[1], 23);
  f.settle();
  f.move(40, 0, 'mouse', 243);
  f.tick();
  assert.equal(f.position()[1], 23);
  f.settle();
  assert.equal(f.position()[1], 23);
});

test('Wide and icon buttons retain a 12px horizontal buffer at either cursor edge', () => {
  for (const width of [40, 160, 240]) {
    const f = fixture({ width });
    for (const x of [20, 20 + width]) {
      f.move(x, 0); f.settle();
      const center = f.position()[0];
      const halfWidth = parseFloat(f.lens.style.width) / 2;
      assert.ok(19 - (center - halfWidth) >= 11.99, 'left edge keeps its buffer');
      assert.ok(center + halfWidth - (19 + width) >= 11.99, 'right edge keeps its buffer');
    }
  }
});

test('The shared lens squeezes in the gap and recovers over the next button', () => {
  const f = fixture();
  f.move(40, 0); f.settle();
  f.move(70); f.settle();
  assert.equal(f.lens.style.width, '30.60px');
  assert.equal(f.lens.style.opacity, '1.000');
  assert.equal(f.lens.style.height, '58.24px');
  f.move(100, 1); f.tick();
  assert.match(f.lens.style.transform, /scale\(0\./);
  f.settle();
  assert.equal(f.lens.style.width, '68.00px');
  assert.match(f.lens.style.transform, /scale\(1\.000,1\.000\)/);
  f.group.emit('pointerleave'); f.settle();
  assert.equal(f.lens.style.opacity, '0.000');
});

test('Pill lenses meet laterally while retaining an 8px outer inset', () => {
  for (const width of [80, 72]) {
    const f = fixture({ pill: true, width });
    for (let i = 0; i < 3; i++) {
      f.move(1 + width * (i + .5), i); f.settle();
      assert.equal(parseFloat(f.lens.style.width), width - (i === 1 ? 0 : 8));
      assert.equal(parseFloat(f.lens.style.height), 40);
      assert.deepEqual(f.position(), [width * (i + .5) + (i === 0 ? 4 : i === 2 ? -4 : 0), 28]);
    }
    for (const [x, button] of [[1, 0], [1 + width * 3, 2]]) {
      f.move(x, button); f.settle();
      const halfWidth = parseFloat(f.lens.style.width) / 2;
      assert.ok(f.position()[0] - halfWidth >= 8);
      assert.ok(f.position()[0] + halfWidth <= width * 3 - 8);
    }
    f.move(width * 2 + .9, 1); f.settle();
    f.move(width * 2 + 1.1, 2); f.tick();
    assert.equal(f.lens.style.opacity, '1.000');
    assert.match(f.lens.style.transform, /scale\(0\./);
    f.settle();
    assert.equal(parseFloat(f.lens.style.width), width - 8);
    assert.equal(f.position()[1], 28);
  }
});

test('Pill transfers leave room for the stretched top and bottom border on every frame', () => {
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  const clipStyle = css.match(/\.footer-glass-clip\{([^}]+)\}/)[1];
  assert.match(clipStyle, /(?:^|;)inset:0(?:;|$)/);
  for (const width of [80, 72]) {
    const f = fixture({ pill: true, width });
    assert.equal(f.clip.style.inset, undefined, 'do not override the outer clipping boundary with the lens inset');
    f.move(1 + width / 2, 0); f.settle();
    for (const button of [1, 2, 1, 0]) {
      f.move(1 + width * (button + .5), button);
      for (let frame = 0; frame < 24; frame++) {
        f.tick();
        const scaleY = Number(f.lens.style.transform.match(/scale\([-.\d]+,([-.\d]+)\)/)[1]);
        const halfHeight = parseFloat(f.lens.style.height) * scaleY / 2;
        const y = f.position()[1];
        assert.ok(y - halfHeight > 0, 'top border stays inside the clip');
        assert.ok(y + halfHeight < 56, 'bottom border stays inside the clip');
      }
    }
    f.settle();
  }
});

test('Reduced motion is static, while touch and disabled buttons do not create a lens', () => {
  const f = fixture({ reduced: true });
  f.move(22, 0);
  assert.equal(f.frames.size, 0);
  assert.equal(f.lens.style.width, '68.00px');
  const initial = f.position();
  f.move(52, 0);
  assert.deepEqual(f.position(), initial);
  const touch = fixture();
  touch.move(40, 0, 'touch');
  assert.equal(touch.frames.size, 0);
  touch.buttons[0].disabled = true;
  touch.move(40, 0);
  touch.settle();
  assert.equal(touch.lens.style.opacity, '0.000');
});

test('Focus, page changes, visibility loss and pointer cancellation clean up the lens', () => {
  const f = fixture();
  f.group.emit('focusin', { target: f.buttons[1] }); f.settle();
  assert.equal(f.lens.style.opacity, '1.000');
  f.group.emit('focusout'); f.settle();
  assert.equal(f.lens.style.opacity, '0.000');
  for (const reset of [() => f.window.emit('blur'), () => f.window.emit('pointercancel'),
    () => f.document.emit('visibilitychange'), ...f.observers]) {
    f.move(40, 0); f.tick(); reset();
    assert.equal(f.frames.size, 0);
    assert.equal(f.lens.style.opacity, '0.000');
  }
});

test('Pointer hover hands the cursor to the lens across buttons and releases on exit or reset', () => {
  const f = fixture();
  f.move(40, 0); f.settle();
  assert.ok(f.morphTargets.at(-1));
  f.move(70); f.settle();
  f.move(100, 1); f.settle();
  assert.ok(f.morphTargets.every(Boolean), 'scrubbing through a gap never releases the cursor');
  f.group.emit('pointerleave', { clientX: 225, clientY: 224 }); f.settle();
  assert.equal(f.morphTargets.at(-1), null);
  assert.equal(f.position()[0], 124, 'the glass contracts toward the exit');
  f.move(100, 1); f.settle();
  f.window.emit('blur');
  assert.equal(f.morphTargets.at(-1), null);
});

test('Keyboard focus keeps the cursor independent, and moving off a focused button releases it', () => {
  const f = fixture();
  f.group.emit('focusin', { target: f.buttons[1] }); f.settle();
  assert.equal(f.morphTargets.length, 0);
  f.move(100, 1); f.settle();
  f.document.activeElement = f.buttons[1];
  f.move(200); f.settle();
  assert.equal(f.morphTargets.at(-1), null);
  assert.equal(f.lens.style.opacity, '1.000', 'keyboard focus can retain its highlight independently');
});
