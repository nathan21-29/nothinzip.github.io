/* WhiteCat's classic, time-sampled cursor trail. Kept separate from the portfolio runtime. */
(() => {
  'use strict';

  const SIZE = .7;
  const PRESS_DURATION = 200;
  const PRESS_SCALE = 1.2;
  // Classic osu! trails without cursormiddle are sampled at 60 Hz.
  // Each snapshot stays at its original position; faster movement naturally leaves wider gaps.
  const SAMPLE_INTERVAL = 1000 / 60;
  const FADE_DURATION = 150;
  const TRAIL_SIZE = 64 * SIZE;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const root = document.documentElement;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return;

  const cursorImage = new Image();
  const trailImage = new Image();
  const assetBase = new URL('assets/whitecat/', document.currentScript.src);
  // Native cursor images keep pointer movement independent of animation frames.
  // Even dimensions keep every frame's hotspot exactly centred.
  const pressFrames = Array.from({ length: 10 }, (_, index) => {
    const size = 90 + index * 2;
    const image = new Image();
    image.src = new URL(index ? `cursor-pressed-${size}.png` : 'cursor-0.7x.png', assetBase).href;
    return { image, size };
  });
  let imagesReady = false;
  let enabled = false;
  let frame = 0;
  let lastSample = -Infinity;
  let lastPosition = null;
  let points = [];
  let pressed = false;
  let pressFrame = 0;
  let pressTransition = null;
  let cursorFrameIndex = -1;

  canvas.className = 'whitecat-trail';
  canvas.setAttribute('aria-hidden', 'true');
  // A non-interactive top-layer canvas also works above modal dialogs.
  if (typeof canvas.showPopover === 'function') canvas.setAttribute('popover', 'manual');
  document.body.append(canvas);

  function raiseTrail() {
    if (!canvas.hasAttribute('popover')) return;
    if (canvas.matches(':popover-open')) canvas.hidePopover();
    canvas.showPopover();
  }

  function clearTrail() {
    cancelAnimationFrame(frame);
    frame = 0;
    points = [];
    lastPosition = null;
    lastSample = -Infinity;
    context.clearRect(0, 0, innerWidth, innerHeight);
  }

  function applyCursorScale(scale) {
    const index = Math.max(0, Math.min(pressFrames.length - 1,
      Math.round((scale - 1) / (PRESS_SCALE - 1) * (pressFrames.length - 1))));
    if (index === cursorFrameIndex) return;
    const { image, size } = pressFrames[index];
    root.style.setProperty('--whitecat-cursor', `url("${image.src}") ${size / 2} ${size / 2}`);
    cursorFrameIndex = index;
  }

  function currentPressScale(time) {
    if (!pressTransition) return pressed ? PRESS_SCALE : 1;
    const progress = Math.min(1, Math.max(0, (time - pressTransition.start) / PRESS_DURATION));
    // Quintic ease-out approaches its endpoint very slowly over the final 20%.
    const eased = 1 - (1 - progress) ** 5;
    return pressTransition.from + (pressTransition.to - pressTransition.from) * eased;
  }

  function animatePress(time) {
    pressFrame = 0;
    applyCursorScale(currentPressScale(time));
    if (time - pressTransition.start < PRESS_DURATION) {
      pressFrame = requestAnimationFrame(animatePress);
    } else {
      pressTransition = null;
    }
  }

  function setPressed(nextPressed) {
    if (pressed === nextPressed) return;
    const time = performance.now();
    const from = currentPressScale(time);
    pressed = nextPressed;
    cancelAnimationFrame(pressFrame);
    pressFrame = 0;
    pressTransition = null;
    const to = pressed ? PRESS_SCALE : 1;
    if (!enabled) { applyCursorScale(to); return; }
    // Reversing a quick press starts from the current size without snapping.
    pressTransition = { from, to, start: time };
    applyCursorScale(from);
    pressFrame = requestAnimationFrame(animatePress);
  }

  function resetPointer() {
    clearTrail();
    pressed = false;
    cancelAnimationFrame(pressFrame);
    pressFrame = 0;
    pressTransition = null;
    applyCursorScale(1);
  }

  function resize() {
    // Keep the allocation reasonable on very high density displays.
    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(innerWidth * ratio);
    canvas.height = Math.round(innerHeight * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    clearTrail();
  }

  function updatePreference() {
    // The portfolio owns the motion preference. A separate system-preference gate
    // can hide the trail even when its visible control says "Motion on".
    enabled = imagesReady && finePointer.matches && !document.body.classList.contains('reduced-motion');
    root.classList.toggle('whitecat-cursor', imagesReady && finePointer.matches);
    if (!enabled) {
      clearTrail();
      cancelAnimationFrame(pressFrame);
      pressFrame = 0;
      pressTransition = null;
      if (!finePointer.matches) pressed = false;
      applyCursorScale(pressed ? PRESS_SCALE : 1);
    }
  }

  function draw(time) {
    frame = 0;
    context.clearRect(0, 0, innerWidth, innerHeight);
    points = points.filter(point => time - point.time < FADE_DURATION);
    for (const point of points) {
      const age = Math.max(0, time - point.time) / FADE_DURATION;
      context.globalAlpha = .65 * (1 - age);
      // Draw independent, fixed-size sprites with normal blending, never a connecting path.
      context.drawImage(trailImage, point.x - TRAIL_SIZE / 2, point.y - TRAIL_SIZE / 2, TRAIL_SIZE, TRAIL_SIZE);
    }
    context.globalAlpha = 1;
    if (points.length) frame = requestAnimationFrame(draw);
  }

  document.addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse') { clearTrail(); return; }
    // Also recover if Mouse1 was released outside the window.
    if (typeof event.buttons === 'number' && imagesReady && finePointer.matches) setPressed(Boolean(event.buttons & 1));
    if (!enabled || document.hidden) return;
    if (event.target.closest?.('input, textarea, select, [contenteditable="true"]')) {
      clearTrail();
      return;
    }
    const time = performance.now();
    if (lastPosition?.x === event.clientX && lastPosition?.y === event.clientY) return;
    if (time - lastSample < SAMPLE_INTERVAL - .01) return;
    // Skip missed samples rather than interpolating a continuous trail across a fast flick.
    const elapsed = time - lastSample;
    lastSample = Number.isFinite(elapsed)
      ? lastSample + Math.max(1, Math.floor(elapsed / SAMPLE_INTERVAL)) * SAMPLE_INTERVAL
      : time;
    lastPosition = { x: event.clientX, y: event.clientY };
    points.push({ ...lastPosition, time });
    if (!frame) frame = requestAnimationFrame(draw);
  }, { passive: true });

  document.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' && event.button === 0 && imagesReady && finePointer.matches) setPressed(true);
  }, { passive: true, capture: true });
  document.addEventListener('pointerup', event => {
    if (event.pointerType === 'mouse' && event.button === 0) setPressed(false);
  }, { passive: true, capture: true });
  document.addEventListener('pointercancel', event => {
    if (event.pointerType === 'mouse') resetPointer();
  }, { passive: true, capture: true });

  document.documentElement.addEventListener('pointerleave', resetPointer);
  window.addEventListener('blur', resetPointer);
  window.addEventListener('pagehide', resetPointer);
  window.addEventListener('resize', resize, { passive: true });
  document.addEventListener('visibilitychange', resetPointer);
  finePointer.addEventListener('change', updatePreference);
  new MutationObserver(updatePreference).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  new MutationObserver(records => {
    if (records.some(record => record.target instanceof HTMLDialogElement)) {
      clearTrail();
      raiseTrail();
    }
  }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open'] });

  function onImageLoad() {
    imagesReady = cursorImage.complete && cursorImage.naturalWidth > 0 && trailImage.complete && trailImage.naturalWidth > 0;
    updatePreference();
  }
  cursorImage.onload = trailImage.onload = onImageLoad;
  cursorImage.src = new URL('cursor-0.7x.png', assetBase).href;
  trailImage.src = new URL('cursortrail@2x.png', assetBase).href;
  resize();
  raiseTrail();
})();
