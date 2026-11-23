/* One bounded drawing surface replaces 120 independently animated SVG elements. */
(() => {
  'use strict';
  const host = document.getElementById('cookie-spectrum');
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  host.replaceChildren(canvas);
  const interval = 1000 / 30;
  const bars = Array.from({ length: 120 }, (_, i) => {
    const angle = i * Math.PI / 60;
    return {
      x: Math.sin(angle), y: -Math.cos(angle),
      length: 9 + (Math.sin(i * 2.37) + 1) * 21 + (i % 7 === 0 ? 12 : 0),
      duration: 1.1 + (i % 11) * .093,
      phase: i * .137 + Math.sin(i * .73) * .4,
      opacity: .22 + (i % 5) * .07
    };
  });
  // Sample CSS ease-in-out once, instead of solving its Bezier for every bar/frame.
  const easing = Float32Array.from({ length: 257 }, (_, i) => {
    const x = i / 256;
    let lo = 0, hi = 1;
    for (let j = 0; j < 16; j++) {
      const t = (lo + hi) / 2;
      const bx = 3 * (1 - t) ** 2 * t * .42 + 3 * (1 - t) * t * t * .58 + t ** 3;
      if (bx < x) lo = t; else hi = t;
    }
    const t = (lo + hi) / 2;
    return 3 * (1 - t) * t * t + t ** 3;
  });
  const scales = [.35, 1.18, .55, .92, .35];
  const alphas = [.65, 1, .8, 1, .65];
  let active = false, motion = true, frame = 0, lastPaint = null;
  let elapsed = 0, previousTime = null, size = 0;

  function paint() {
    ctx.setTransform(size / 600, 0, 0, size / 600, 0, 0);
    ctx.clearRect(0, 0, 600, 600);
    ctx.strokeStyle = '#f4a6c4';
    ctx.lineWidth = 2;
    for (const bar of bars) {
      const phase = ((elapsed / 1000 + bar.phase) / bar.duration) % 1;
      const segment = Math.min(3, Math.floor(phase / .24));
      const start = segment * .24;
      const span = segment === 3 ? .28 : .24;
      const blend = easing[Math.round(Math.min(1, (phase - start) / span) * 256)];
      const scale = scales[segment] + (scales[segment + 1] - scales[segment]) * blend;
      const radius = 221 + bar.length * scale;
      ctx.globalAlpha = bar.opacity * (alphas[segment] + (alphas[segment + 1] - alphas[segment]) * blend);
      ctx.beginPath();
      ctx.moveTo(300 + bar.x * 221, 300 + bar.y * 221);
      ctx.lineTo(300 + bar.x * radius, 300 + bar.y * radius);
      ctx.stroke();
    }
  }

  function tick(time) {
    frame = 0;
    if (previousTime !== null) elapsed += time - previousTime;
    previousTime = time;
    if (lastPaint === null || time - lastPaint >= interval - .5) {
      lastPaint = lastPaint === null ? time : lastPaint + Math.max(1, Math.floor((time - lastPaint + .5) / interval)) * interval;
      paint();
    }
    frame = requestAnimationFrame(tick);
  }

  function sync() {
    const running = active && motion && !document.hidden && !window.SiteIntro?.active;
    canvas.style.animationPlayState = running ? 'running' : 'paused';
    if (running && !frame) frame = requestAnimationFrame(tick);
    if (!running) {
      cancelAnimationFrame(frame);
      frame = 0;
      previousTime = null;
      lastPaint = null;
    }
  }
  new ResizeObserver(entries => {
    const width = entries[0].contentRect.width;
    if (!width) return;
    // Thin decorative lines remain sharp without allocating an unbounded Retina surface.
    const next = Math.min(1200, Math.ceil(width * Math.min(devicePixelRatio || 1, 1.5)));
    if (next === size) return;
    size = canvas.width = canvas.height = next;
    paint();
  }).observe(host);
  document.addEventListener('visibilitychange', sync);
  document.addEventListener('site:intro-end', sync);
  window.HomeSpectrum = {
    setActive(value) { active = value; sync(); },
    setMotion(value) { motion = value; sync(); }
  };
})();
