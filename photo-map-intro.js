/* A short, 30 fps globe-to-Japan flight; no rendering continues after landing. */
(() => {
  'use strict';
  const map = document.querySelector('.photo-map');
  const canvas = document.querySelector('#photo-globe');
  const pins = document.querySelector('#photo-map-pins');
  const data = window.PHOTO_GLOBE_DATA;
  if (!map || !canvas || !pins || !data) return;
  const radians = Math.PI / 180;
  const clamp = value => Math.max(0, Math.min(1, value));
  const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
  const targetLongitude = 128 + 300 / 33;
  const targetLatitude = 46 - 315 / 40;
  const duration = 2150;
  // Densify long coastline edges once, so their horizon follows the sphere.
  function prepare(ring, closed = true) {
    return ring.flatMap((point, index) => {
      const next = !closed && index === ring.length - 1 ? point : ring[(index + 1) % ring.length];
      let deltaLongitude = next[0] - point[0];
      if (deltaLongitude > 180) deltaLongitude -= 360;
      if (deltaLongitude < -180) deltaLongitude += 360;
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(deltaLongitude), Math.abs(next[1] - point[1])) / 3));
      return Array.from({ length: steps }, (_, step) => {
        const lon = point[0] + deltaLongitude * step / steps;
        const lat = point[1] + (next[1] - point[1]) * step / steps;
        return { lon, lat, sinLon: Math.sin(lon * radians), cosLon: Math.cos(lon * radians), sinLat: Math.sin(lat * radians), cosLat: Math.cos(lat * radians) };
      });
    });
  }
  const land = data.land.map(ring => prepare(ring));
  const japan = data.japan.map(ring => prepare(ring));
  const grid = [];
  for (let lat = -60; lat <= 60; lat += 30) grid.push(prepare(Array.from({ length: 121 }, (_, i) => [-180 + i * 3, lat]), false));
  for (let lon = -180; lon < 180; lon += 30) grid.push(prepare(Array.from({ length: 61 }, (_, i) => [lon, -90 + i * 3]), false));
  let active = false, motion = true, frame = 0, start = null, lastPaint = -Infinity, context;

  function finish() {
    cancelAnimationFrame(frame);
    frame = 0;
    start = null;
    delete map.dataset.globeIntro;
    pins.inert = false;
    canvas.hidden = true;
    // Release its backing store; the ordinary SVG map takes over completely.
    canvas.width = canvas.height = 1;
  }

  function draw(time) {
    const spin = 1 - (1 - clamp(time / 1250)) ** 2;
    const zoom = smooth((time - 950) / 1000);
    const flatten = smooth((zoom - .45) / .55);
    const lon = (-110 + (targetLongitude + 110) * spin) * radians;
    const lat = (14 + (targetLatitude - 14) * smooth(time / 1250)) * radians;
    const radius = 234 * (40 / radians / 234) ** zoom;
    const sinLon = Math.sin(lon), cosLon = Math.cos(lon), sinLat = Math.sin(lat), cosLat = Math.cos(lat);
    const project = (point, blend = 0) => {
      const deltaSin = point.sinLon * cosLon - point.cosLon * sinLon;
      const deltaCos = point.cosLon * cosLon + point.sinLon * sinLon;
      const x = point.cosLat * deltaSin;
      const y = cosLat * point.sinLat - sinLat * point.cosLat * deltaCos;
      const z = sinLat * point.sinLat + cosLat * point.cosLat * deltaCos;
      return { x: (320 + radius * x) * (1 - blend) + (20 + (point.lon - 128) * 33) * blend,
        y: (335 - radius * y) * (1 - blend) + (20 + (46 - point.lat) * 40) * blend,
        flatX: 20 + (point.lon - 128) * 33, flatY: 20 + (46 - point.lat) * 40,
        sphereX: x, sphereY: y, z, visible: z >= 0 };
    };
    const ctx = context;
    ctx.clearRect(0, 0, 640, 670);
    ctx.save();
    ctx.beginPath(); ctx.arc(320, 335, radius, 0, Math.PI * 2); ctx.clip();
    const ocean = ctx.createRadialGradient(255, 245, 20, 320, 335, radius);
    ocean.addColorStop(0, '#4b3049'); ocean.addColorStop(1, '#211824');
    ctx.globalAlpha = 1 - smooth((time - 1700) / 350);
    ctx.fillStyle = ocean; ctx.fillRect(0, 0, 640, 670);
    ctx.lineWidth = .85; ctx.strokeStyle = '#ed91bc45';
    for (const ring of grid) {
      ctx.beginPath();
      let pen = false;
      for (const point of ring) {
        const p = project(point);
        if (!p.visible) { pen = false; continue; }
        if (pen) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y);
        pen = true;
      }
      ctx.stroke();
    }
    function paint(rings, fill, blend = 0) {
      ctx.fillStyle = fill;
      for (const ring of rings) {
        const projected = ring.map(point => project(point, blend));
        if (!projected.some(point => point.visible)) continue;
        // Clip at the horizon before filling. Projecting back-facing vertices
        // onto the rim creates chords through the ocean near the back pole.
        const clipped = [];
        let exit = null;
        const first = projected.findIndex(point => point.visible);
        const crossing = (a, b) => {
          const t = a.z / (a.z - b.z);
          let x = a.sphereX + (b.sphereX - a.sphereX) * t;
          let y = a.sphereY + (b.sphereY - a.sphereY) * t;
          const length = Math.hypot(x, y);
          x /= length; y /= length;
          const flatX = a.flatX + (b.flatX - a.flatX) * t;
          const flatY = a.flatY + (b.flatY - a.flatY) * t;
          return { x: (320 + radius * x) * (1 - blend) + flatX * blend,
            y: (335 - radius * y) * (1 - blend) + flatY * blend, flatX, flatY,
            angle: Math.atan2(-y, x) };
        };
        for (let i = 0; i < projected.length; i++) {
          const a = projected[(first + i) % projected.length];
          const b = projected[(first + i + 1) % projected.length];
          if (a.visible) clipped.push(a);
          if (a.visible === b.visible) continue;
          const edge = crossing(a, b);
          if (a.visible) { clipped.push(edge); exit = edge; }
          else if (exit) {
            let sweep = edge.angle - exit.angle;
            sweep = Math.atan2(Math.sin(sweep), Math.cos(sweep));
            const steps = Math.max(1, Math.ceil(Math.abs(sweep) / (3 * radians)));
            for (let j = 1; j < steps; j++) {
              const t = j / steps, angle = exit.angle + sweep * t;
              clipped.push({
                x: (320 + radius * Math.cos(angle)) * (1 - blend) + (exit.flatX + (edge.flatX - exit.flatX) * t) * blend,
                y: (335 + radius * Math.sin(angle)) * (1 - blend) + (exit.flatY + (edge.flatY - exit.flatY) * t) * blend
              });
            }
            clipped.push(edge); exit = null;
          }
        }
        ctx.beginPath();
        clipped.forEach((point, i) => i ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
        ctx.closePath(); ctx.fill();
      }
    }
    // World rings cross the date line and cannot morph into Japan's local
    // longitude coordinates without sweeping huge filled polygons over Japan.
    // Keep the world spherical and fade it away before the local map unfolds.
    ctx.globalAlpha *= 1 - smooth((zoom - .2) / .25);
    if (ctx.globalAlpha > 0) paint(land, '#a68aa5');
    ctx.globalAlpha = .82;
    paint(japan, `rgb(${Math.round(237 - 39 * zoom)},${Math.round(145 + 37 * zoom)},${Math.round(188 + 11 * zoom)})`, flatten);
    ctx.restore();
    ctx.globalAlpha = (1 - zoom) * .7;
    ctx.strokeStyle = '#ed91bc'; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.arc(320, 335, radius, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function tick(time) {
    frame = 0;
    if (!active || !motion || document.hidden) { finish(); return; }
    start ??= time;
    const elapsed = time - start;
    if (elapsed >= duration) { finish(); return; }
    if (time - lastPaint >= 1000 / 30 - .5) {
      try { draw(elapsed); } catch { finish(); return; }
      lastPaint = time;
      const phase = elapsed < 950 ? 'spinning' : elapsed < 1850 ? 'zooming' : 'landing';
      if (map.dataset.globeIntro !== phase) map.dataset.globeIntro = phase;
    }
    frame = requestAnimationFrame(tick);
  }

  function begin() {
    finish();
    if (!motion || document.hidden) return;
    const bounds = map.getBoundingClientRect();
    // The compact mobile layout has location chips in place of the map.
    if (!bounds.width || !bounds.height) return;
    try { context = canvas.getContext('2d'); } catch { return; }
    if (!context) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5, 850 / Math.max(bounds.width, bounds.height));
    canvas.width = Math.max(1, Math.round(bounds.width * ratio));
    canvas.height = Math.max(1, Math.round(bounds.height * ratio));
    context.setTransform(canvas.width / 640, 0, 0, canvas.height / 670, 0, 0);
    canvas.hidden = false;
    pins.inert = true;
    map.dataset.globeIntro = 'spinning';
    lastPaint = -Infinity;
    try { draw(0); frame = requestAnimationFrame(tick); } catch { finish(); }
  }
  window.PhotoMapIntro = {
    setActive(value) { if (value === active) return; active = value; if (active) begin(); else finish(); },
    setMotion(value) { motion = value; if (!motion) finish(); },
    finish
  };
  window.addEventListener('resize', finish, { passive: true });
  window.addEventListener('pagehide', finish);
  document.addEventListener('visibilitychange', () => { if (document.hidden) finish(); });
  document.querySelector('#photography-screen').addEventListener('click', event => {
    if (event.target.closest('[data-photo-city],#photo-all')) finish();
  });
})();
