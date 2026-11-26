/* One small, shared glass lens per footer group; frames stop when it settles. */
(() => {
  'use strict';
  const TRACKING = .1;
  const BUFFER_X = 12;
  const BUFFER_Y = 6;
  const PILL_INSET = 8;
  const SLICE_SIZE = 64;
  const KEYS = ['x', 'y', 'width', 'height', 'opacity'];
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  let cursorOwner = null;
  const groups = [...document.querySelectorAll('.footer-actions,.footer-start,.footer-controls')];
  const controllers = groups.map(group => {
    const pill = group.matches('.footer-actions');
    const lens = document.createElement('div');
    lens.className = 'footer-glass';
    lens.setAttribute('aria-hidden', 'true');
    // Fixed-size end caps and a stretched middle keep rounded ends without
    // resizing/repainting a blurred, bordered element on every spring frame.
    const slices = ['left', 'middle', 'right'].map(side => {
      const slice = document.createElement('span');
      slice.className = `footer-glass-slice footer-glass-${side}`;
      lens.append(slice);
      return slice;
    });
    if (pill) {
      // Clip at the pill's outer edge, leaving room for the lens to stretch vertically.
      // The lens geometry reserves its own inset; tooltips remain outside this layer.
      const clip = document.createElement('div');
      clip.className = 'footer-glass-clip';
      clip.setAttribute('aria-hidden', 'true');
      clip.append(lens);
      group.prepend(clip);
    } else group.prepend(lens);
    group.classList.add('has-footer-glass');

    const current = { x: 0, y: 0, width: 0, height: 0, opacity: 0 };
    const target = { ...current };
    const velocity = { ...current };
    let frame = 0;
    let lastTime = 0;
    let activeButton = null;
    let pointer = null;
    let transferStart = null;
    let pressed = false;
    let pillWidth = 0;
    let geometry = null;
    let lastAnchor = null;
    const buttons = [...group.querySelectorAll('button')];
    const reduced = () => document.body.classList.contains('reduced-motion');
    const available = button => button && !button.disabled && !button.closest('[hidden],[inert]') && button.getClientRects().length;

    function releaseCursor() {
      if (cursorOwner !== group) return;
      cursorOwner = null;
      lastAnchor = null;
      window.SiteCursor?.setMorphTarget(null);
    }

    function paint(squeeze = 0) {
      const press = pressed ? .94 : 1;
      const width = Math.max(0, current.width);
      const height = Math.max(0, current.height);
      const scaleX = (1 - squeeze * .4) * press;
      const halfWidth = width * scaleX / 2;
      // Keep the lens inside the inset even while tracking at the outer buttons.
      const x = pill ? Math.max(PILL_INSET + halfWidth, Math.min(pillWidth - PILL_INSET - halfWidth, current.x)) : current.x;
      const y = current.y;
      writeStyle(lens, 'transform', `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0) scale(${scaleX.toFixed(3)},${((1 + squeeze * .12) * press).toFixed(3)})`);
      writeStyle(lens, 'opacity', Math.max(0, Math.min(1, current.opacity)).toFixed(3));
      const cap = Math.min(width, height) / 2;
      const middle = Math.max(0, width - cap * 2);
      const positions = [-width / 2, -width / 2 + cap, width / 2 - cap];
      slices.forEach((slice, index) => {
        const scale = index === 1 ? middle / SLICE_SIZE : cap / (SLICE_SIZE / 2);
        writeStyle(slice, 'transform', `translate3d(${positions[index].toFixed(3)}px,${(-height / 2).toFixed(3)}px,0) scale(${scale.toFixed(6)},${(height / SLICE_SIZE).toFixed(6)})`);
      });
      if (cursorOwner === group && geometry) {
        const anchor = { x: geometry.x + x, y: geometry.y + y };
        if (!lastAnchor || anchor.x !== lastAnchor.x || anchor.y !== lastAnchor.y) {
          window.SiteCursor?.setMorphTarget(anchor);
          lastAnchor = anchor;
        }
      }
    }

    function writeStyle(element, property, value) {
      if (element.style[property] !== value) element.style[property] = value;
    }

    function tick(time) {
      frame = 0;
      const dt = lastTime ? Math.min((time - lastTime) / 1000, 1 / 30) : 1 / 60;
      lastTime = time;
      let moving = false;
      // A damped spring preserves momentum when scrubbing reverses direction.
      for (const key of KEYS) {
        velocity[key] += ((target[key] - current[key]) * 420 - velocity[key] * 36) * dt;
        current[key] += velocity[key] * dt;
        const tolerance = key === 'opacity' ? .002 : .025;
        if (Math.abs(target[key] - current[key]) > tolerance || Math.abs(velocity[key]) > tolerance * 12) moving = true;
        else { current[key] = target[key]; velocity[key] = 0; }
      }
      const progress = transferStart === null ? 1 : Math.min(1, (time - transferStart) / 260);
      paint(Math.sin(progress * Math.PI));
      if (progress === 1) transferStart = null;
      if (moving || transferStart !== null) frame = requestAnimationFrame(tick);
      else lastTime = 0;
    }

    function queue() {
      if (reduced()) {
        cancelAnimationFrame(frame);
        frame = 0;
        transferStart = null;
        Object.assign(current, target);
        for (const key of KEYS) velocity[key] = 0;
        paint();
      } else if (!frame) frame = requestAnimationFrame(tick);
    }

    function bounds(button, origin) {
      const rect = button.getBoundingClientRect();
      const hitLeft = rect.left - origin.left - group.clientLeft;
      const hitX = hitLeft + rect.width / 2;
      const left = pill ? Math.max(PILL_INSET, hitLeft) : hitLeft;
      const right = pill ? Math.min(pillWidth - PILL_INSET, hitLeft + rect.width) : hitLeft + rect.width;
      return { x: pill ? (left + right) / 2 : hitX, hitX,
        y: rect.top - origin.top - group.clientTop + rect.height / 2,
        // Only the outer pill edges are inset; neighboring cells still meet laterally.
        // Standalone controls reserve the full horizontal travel plus extra padding.
        width: pill ? Math.max(0, right - left) : rect.width * (1 + TRACKING) + BUFFER_X * 2,
        height: pill ? Math.max(0, rect.height - PILL_INSET * 2) : rect.height + BUFFER_Y * 2, hitWidth: rect.width };
    }

    function measure() {
      if (geometry) return geometry;
      // Read all geometry together, before paint writes. Reuse throughout the
      // interaction, including cursor handoff; invalidate on actual layout changes.
      const origin = group.getBoundingClientRect();
      pillWidth = group.clientWidth;
      geometry = {
        x: origin.left + group.clientLeft, y: origin.top + group.clientTop,
        boxes: new Map(buttons.filter(available).map(button => [button, bounds(button, origin)]))
      };
      return geometry;
    }

    function show(button, position = null) {
      const layout = measure();
      const box = layout.boxes.get(button);
      if (!box || button.disabled) return;
      const entry = position ? { x: position.x - layout.x, y: position.y - layout.y } : box;
      const wasVisible = target.opacity > 0;
      if (position) cursorOwner = group;
      else releaseCursor();
      if (!wasVisible) {
        // Grow from the entry x coordinate, with the vertical axis locked throughout.
        Object.assign(current, { x: entry.x, y: box.y, width: 2, height: 2, opacity: 0 });
        for (const key of KEYS) velocity[key] = 0;
        transferStart = null;
        paint();
      } else if (button !== activeButton && !reduced()) transferStart = performance.now();
      activeButton = button;
      Object.assign(target, { x: box.x, y: box.y, width: box.width, height: box.height, opacity: 1 });
      if (position && !reduced()) {
        // Exactly one tenth of pointer displacement inside the button's hitbox.
        target.x += (entry.x - box.hitX) * TRACKING;
      }
      queue();
    }

    function hide() {
      releaseCursor();
      activeButton = null;
      pressed = false;
      transferStart = null;
      target.opacity = 0;
      target.width = 2;
      target.height = 2;
      if (pointer && geometry) {
        // Collapse toward the exit while preserving the lens's locked vertical axis.
        target.x = pointer.x - geometry.x;
      }
      queue();
    }

    function onPointer(event) {
      if (!finePointer.matches || event.pointerType === 'touch') return;
      pointer = { x: event.clientX, y: event.clientY };
      const layout = measure();
      const button = event.target.closest('button');
      if (layout.boxes.has(button) && !button.disabled) { show(button, pointer); return; }
      // Keep the same lens alive through the space between adjacent buttons.
      const x = pointer.x - layout.x;
      const y = pointer.y - layout.y;
      const boxes = [...layout.boxes.values()];
      for (let i = 1; i < boxes.length; i++) {
        const left = boxes[i - 1], right = boxes[i];
        const start = left.hitX + left.hitWidth / 2;
        const end = right.hitX - right.hitWidth / 2;
        if (x < start || x > end || end <= start || Math.abs(y - left.y) > left.height / 2) continue;
        if (!target.opacity) return;
        const t = (x - start) / (end - start);
        const squeeze = Math.sin(t * Math.PI);
        Object.assign(target, {
          x: left.x + (right.x - left.x) * t,
          y: left.y + (right.y - left.y) * t,
          width: (left.width + (right.width - left.width) * t) * (1 - squeeze * .55),
          height: (left.height + (right.height - left.height) * t) * (1 + squeeze * .12), opacity: 1
        });
        if (reduced()) hide();
        else queue();
        return;
      }
      releaseCursor();
      if (layout.boxes.has(document.activeElement) && document.activeElement.matches(':focus-visible')) show(document.activeElement);
      else hide();
    }

    function reset() {
      releaseCursor();
      cancelAnimationFrame(frame);
      frame = 0;
      lastTime = 0;
      transferStart = null;
      activeButton = null;
      pointer = null;
      pressed = false;
      geometry = null;
      lastAnchor = null;
      for (const key of KEYS) current[key] = target[key] = velocity[key] = 0;
      paint();
    }

    group.addEventListener('pointerover', onPointer);
    group.addEventListener('pointermove', onPointer, { passive: true });
    group.addEventListener('pointerleave', event => {
      if (Number.isFinite(event.clientX)) pointer = { x: event.clientX, y: event.clientY };
      releaseCursor();
      if (group.contains(document.activeElement) && document.activeElement.matches(':focus-visible')) show(document.activeElement);
      else hide();
      pointer = null;
      geometry = null;
    });
    group.addEventListener('pointerdown', event => {
      if (event.pointerType !== 'touch' && activeButton) { pressed = true; queue(); }
    });
    group.addEventListener('focusin', event => {
      if (event.target.matches('button:focus-visible')) show(event.target);
    });
    group.addEventListener('focusout', () => {
      if (!pointer) { hide(); geometry = null; }
    });
    // Footer entrance/exit transforms and responsive cells can move cached boxes.
    for (const type of ['transitionend', 'animationend']) {
      group.addEventListener(type, event => { if (event.target === group) reset(); });
    }
    const resize = new ResizeObserver(reset);
    resize.observe(group);
    buttons.forEach(button => resize.observe(button));
    new MutationObserver(reset).observe(group, { attributes: true, attributeFilter: ['hidden', 'inert', 'disabled'], subtree: true });
    return { reset, release() { if (pressed) { pressed = false; queue(); } } };
  });

  const reset = () => controllers.forEach(controller => controller.reset());
  window.addEventListener('pointerup', () => controllers.forEach(controller => controller.release()));
  window.addEventListener('pointercancel', reset);
  window.addEventListener('blur', reset);
  window.addEventListener('resize', reset, { passive: true });
  document.addEventListener('visibilitychange', reset);
  finePointer.addEventListener('change', reset);
  new MutationObserver(reset).observe(document.body, { attributes: true, attributeFilter: ['class', 'data-screen'] });
  new MutationObserver(reset).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open'] });
})();
