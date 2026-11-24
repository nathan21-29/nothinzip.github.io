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
    const project = point => {
      const deltaSin = point.sinLon * cosLon - point.cosLon * sinLon;
      const deltaCos = point.cosLon * cosLon + point.sinLon * sinLon;
      let x = point.cosLat * deltaSin;
      let y = cosLat * point.sinLat - sinLat * point.cosLat * deltaCos;
      const z = sinLat * point.sinLat + cosLat * point.cosLat * deltaCos;
      // Hidden portions of a clipped coastline travel along the globe's rim.
      if (z < 0) { const length = Math.hypot(x, y) || 1; x /= length; y /= length; }
      return { x: (320 + radius * x) * (1 - flatten) + (20 + (point.lon - 128) * 33) * flatten,
        y: (335 - radius * y) * (1 - flatten) + (20 + (46 - point.lat) * 40) * flatten, visible: z >= 0 };
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
    function paint(rings, fill) {
      ctx.fillStyle = fill;
      for (const ring of rings) {
        const projected = ring.map(project);
        if (!projected.some(point => point.visible)) continue;
        ctx.beginPath();
        projected.forEach((point, i) => i ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
        ctx.closePath(); ctx.fill();
      }
    }
    paint(land, '#a68aa5');
    ctx.globalAlpha = .82;
    paint(japan, `rgb(${Math.round(237 - 39 * zoom)},${Math.round(145 + 37 * zoom)},${Math.round(188 + 11 * zoom)})`);
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
