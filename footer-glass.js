/* One small, shared glass lens per footer group; frames stop when it settles. */
(() => {
  'use strict';
  const TRACKING = .1;
  const BUFFER_X = 12;
  const BUFFER_Y = 6;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const groups = [...document.querySelectorAll('.footer-actions,.footer-start,.footer-controls')];
  const controllers = groups.map(group => {
    const pill = group.matches('.footer-actions');
    const lens = document.createElement('div');
    lens.className = 'footer-glass';
    lens.setAttribute('aria-hidden', 'true');
    if (pill) {
      // Clip only the glass so the button tooltips can still extend above the pill.
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
    const reduced = () => document.body.classList.contains('reduced-motion');
    const available = button => button && !button.disabled && !button.closest('[hidden],[inert]') && button.getClientRects().length;

    function paint(squeeze = 0) {
      const press = pressed ? .94 : 1;
      lens.style.width = `${Math.max(0, current.width).toFixed(2)}px`;
      lens.style.height = `${Math.max(0, current.height).toFixed(2)}px`;
      lens.style.transform = `translate3d(${current.x.toFixed(2)}px,${current.y.toFixed(2)}px,0) translate(-50%,-50%) scale(${((1 - squeeze * .4) * press).toFixed(3)},${((1 + squeeze * .12) * press).toFixed(3)})`;
      lens.style.opacity = Math.max(0, Math.min(1, current.opacity)).toFixed(3);
    }

    function tick(time) {
      frame = 0;
      const dt = lastTime ? Math.min((time - lastTime) / 1000, 1 / 30) : 1 / 60;
      lastTime = time;
      let moving = false;
      // A damped spring preserves momentum when scrubbing reverses direction.
      for (const key of Object.keys(current)) {
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
        for (const key of Object.keys(velocity)) velocity[key] = 0;
        paint();
      } else if (!frame) frame = requestAnimationFrame(tick);
    }

    function bounds(button, origin) {
      const rect = button.getBoundingClientRect();
      return { x: rect.left - origin.left - group.clientLeft + rect.width / 2,
        y: rect.top - origin.top - group.clientTop + rect.height / 2,
        // Pill hitboxes already include the icon's buffer and tile the whole surface.
        // Standalone controls reserve the full horizontal travel plus extra padding.
        width: pill ? rect.width : rect.width * (1 + TRACKING) + BUFFER_X * 2,
        height: pill ? rect.height : rect.height + BUFFER_Y * 2, hitWidth: rect.width };
    }

    function show(button, position = null) {
      if (!available(button)) return;
      const origin = group.getBoundingClientRect();
      const box = bounds(button, origin);
      const entry = position ? { x: position.x - origin.left - group.clientLeft, y: position.y - origin.top - group.clientTop } : box;
      const wasVisible = target.opacity > 0;
      if (!wasVisible) {
        // Grow from the entry x coordinate, with the vertical axis locked throughout.
        Object.assign(current, { x: entry.x, y: box.y, width: 2, height: 2, opacity: 0 });
        for (const key of Object.keys(velocity)) velocity[key] = 0;
        transferStart = null;
        paint();
      } else if (button !== activeButton && !reduced()) transferStart = performance.now();
      activeButton = button;
      Object.assign(target, { x: box.x, y: box.y, width: box.width, height: box.height, opacity: 1 });
      if (position && !reduced()) {
        // Exactly one tenth of pointer displacement inside the button's hitbox.
        target.x += (entry.x - box.x) * TRACKING;
      }
      queue();
    }

    function hide() {
      activeButton = null;
      pressed = false;
      transferStart = null;
      target.opacity = 0;
      target.width = 2;
      target.height = 2;
      queue();
    }

    function onPointer(event) {
      if (!finePointer.matches || event.pointerType === 'touch') return;
      pointer = { x: event.clientX, y: event.clientY };
      const button = event.target.closest('button');
      if (button && group.contains(button) && available(button)) { show(button, pointer); return; }
      // Keep the same lens alive through the space between adjacent buttons.
      const buttons = [...group.querySelectorAll('button')].filter(available);
      const origin = group.getBoundingClientRect();
      const x = pointer.x - origin.left - group.clientLeft;
      const y = pointer.y - origin.top - group.clientTop;
      const boxes = buttons.map(button => bounds(button, origin));
      for (let i = 1; i < boxes.length; i++) {
        const left = boxes[i - 1], right = boxes[i];
        const start = left.x + left.hitWidth / 2;
        const end = right.x - right.hitWidth / 2;
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
      if (group.contains(document.activeElement) && available(document.activeElement)) show(document.activeElement);
      else hide();
    }

    function reset() {
      cancelAnimationFrame(frame);
      frame = 0;
      lastTime = 0;
      transferStart = null;
      activeButton = null;
      pointer = null;
      pressed = false;
      for (const key of Object.keys(current)) current[key] = target[key] = velocity[key] = 0;
      paint();
    }

    group.addEventListener('pointerover', onPointer);
    group.addEventListener('pointermove', onPointer, { passive: true });
    group.addEventListener('pointerleave', () => {
      pointer = null;
      if (group.contains(document.activeElement) && document.activeElement.matches(':focus-visible')) show(document.activeElement);
      else hide();
    });
    group.addEventListener('pointerdown', event => {
      if (event.pointerType !== 'touch' && activeButton) { pressed = true; queue(); }
    });
    group.addEventListener('focusin', event => {
      if (event.target.matches('button:focus-visible')) show(event.target);
    });
    group.addEventListener('focusout', () => { if (!pointer) hide(); });
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
})();
