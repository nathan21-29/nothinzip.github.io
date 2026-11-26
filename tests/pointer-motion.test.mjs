import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const source = app.slice(app.indexOf('  // Keep animating until'), app.indexOf('  function resetProjectScroll()'));

function fixture() {
  const operations = [], frames = new Map();
  let nextFrame = 0;
  const style = owner => {
    const values = new Map();
    return {
      getPropertyValue: name => values.get(name) || '',
      setProperty(name, value) { operations.push(`write:${owner}`); values.set(name, value); }
    };
  };
  const layers = Array.from({ length: 6 }, () => ({ style: style('layer') }));
  const cards = [100, 220, 340, 460].map(top => ({
    top, style: style('card'),
    querySelector() { return { getBoundingClientRect: () => {
      operations.push('read:card'); return { top: this.top, height: 80 };
    } }; }
  }));
  const document = { documentElement: {}, body: { style: style('body') } };
  const scope = vm.createContext({
    window: { innerWidth: 1200, innerHeight: 800 }, document,
    pointerQuery: { matches: true },
    pointerTargets: layers,
    getComputedStyle() { operations.push('read:font'); return { fontSize: '16px' }; },
    $$: selector => selector === '.song-entry' ? cards : [],
    requestAnimationFrame(fn) { frames.set(++nextFrame, fn); return nextFrame; }
  });
  vm.runInContext(`
    let pointerFrame = 0, pointerPosition = null, cardOffsetsActive = false;
    let parallaxX = '0px', parallaxY = '0px';
    const state = { screen: 'home', motion: true };
    const cursorGravity = { y: null, strength: 0, time: 0 };
    ${source}
    globalThis.control = {
      move(x, y) { pointerPosition = { x, y }; queuePointerMotion(); },
      screen(value) { state.screen = value; queuePointerMotion(); },
      motion(value) { state.motion = value; queuePointerMotion(); }
    };
  `, scope);
  return { ...scope.control, operations, layers, cards, frames,
    tick(time) {
      operations.length = 0;
      const queued = [...frames.values()]; frames.clear(); queued.forEach(fn => fn(time));
    }
  };
}

test('Parallax uses the latest pointer, updates only its layers and skips unchanged values', () => {
  const view = fixture();
  view.move(200, 200); view.move(900, 600);
  assert.equal(view.frames.size, 1);
  view.tick(0);
  assert.ok(view.layers.every(layer => layer.style.getPropertyValue('--pointer-x') === '0.500px'));
  assert.ok(view.layers.every(layer => layer.style.getPropertyValue('--pointer-y') === '0.500px'));
  assert.ok(!view.operations.includes('write:body'));
  view.move(900, 600); view.tick(16);
  assert.equal(view.operations.length, 0, 'stationary input causes no style writes');
  view.screen('about'); view.tick(32);
  assert.ok(view.layers.every(layer => layer.style.getPropertyValue('--pointer-x') === '0px'));
  assert.equal(view.frames.size, 0);
});

test('Project gravity reads all geometry before writing, follows layout changes, and settles', () => {
  const view = fixture();
  view.move(900, 600); view.tick(0);
  view.screen('projects'); view.tick(16);
  const firstWrite = view.operations.findIndex(op => op.startsWith('write:'));
  const lastRead = view.operations.findLastIndex(op => op.startsWith('read:'));
  assert.ok(lastRead < firstWrite, 'no geometry reads follow a style mutation');
  assert.equal(view.operations.filter(op => op === 'read:card').length, 4);
  const oldOffset = view.cards[0].style.getPropertyValue('--cursor-offset');
  view.cards[0].top = 560;
  view.tick(32);
  assert.notEqual(view.cards[0].style.getPropertyValue('--cursor-offset'), oldOffset, 'card expansion/scroll geometry stays live');
  for (let time = 48; time < 4000 && view.frames.size; time += 16) view.tick(time);
  assert.equal(view.frames.size, 0, 'gravity stops requesting frames once settled');
  view.move(900, 600); view.tick(4016);
  assert.equal(view.operations.filter(op => op.startsWith('write:')).length, 0);
  view.motion(false); view.tick(4032);
  assert.ok(view.cards.every(card => Number.parseFloat(card.style.getPropertyValue('--cursor-offset')) === 0));
  assert.equal(view.frames.size, 0);
});
