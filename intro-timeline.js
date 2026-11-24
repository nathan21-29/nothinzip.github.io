/* One deterministic clock for the supplied map's final 5.052-second phrase. */
(() => {
  'use strict';
  const clamp = value => Math.max(0, Math.min(1, value));
  const ease = value => 1 - (1 - clamp(value)) ** 4;
  const mix = (a, b, t) => a + (b - a) * t;
  const beatmap = window.IntroBeatmap;
  const approachRate = 9.2, approach = 570, diameter = 110;
  const offset = beatmap.start - approach;
  const objects = beatmap.objects.map(source => ({
    ...source, x: source.x - 256, y: source.y - 192,
    hit: source.time - offset, end: source.time - offset + (source.duration || 0),
    stack: 0
  }));
  // Both closing triples sit on slider heads. Earlier notes step up-left so the
  // next head remains legible instead of drawing three identical circles.
  for (let index = objects.length - 2; index >= 0; index--) {
    const point = objects[index], next = objects[index + 1];
    if (!point.curve && next.hit - point.hit <= approach * beatmap.stackLeniency
      && Math.hypot(point.x - next.x, point.y - next.y) < 3) point.stack = next.stack + 1;
  }
  for (const point of objects) {
    point.x -= point.stack * diameter / 20;
    point.y -= point.stack * diameter / 20;
  }
  function pathFor(object) {
    const [type, ...controls] = object.curve.split('|');
    if (type !== 'P' || controls.length !== 2) throw new Error('Expected a three-point perfect slider');
    const [a, b, c] = [{ x: object.x, y: object.y }, ...controls.map(value => {
      const [x, y] = value.split(':').map(Number);
      return { x: x - 256, y: y - 192 };
    })];
    const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
    const squared = p => p.x * p.x + p.y * p.y;
    const center = {
      x: (squared(a) * (b.y - c.y) + squared(b) * (c.y - a.y) + squared(c) * (a.y - b.y)) / d,
      y: (squared(a) * (c.x - b.x) + squared(b) * (a.x - c.x) + squared(c) * (b.x - a.x)) / d
    };
    const radius = Math.hypot(a.x - center.x, a.y - center.y);
    const startAngle = Math.atan2(a.y - center.y, a.x - center.x);
    const direction = Math.sign((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x));
    const sweep = direction * object.length / radius;
    const at = progress => {
      if (progress <= 0) return a;
      const angle = startAngle + sweep * clamp(progress);
      return { x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) };
    };
    const velocity = progress => {
      const angle = startAngle + sweep * progress;
      const speed = sweep * radius / object.duration;
      return { x: -Math.sin(angle) * speed, y: Math.cos(angle) * speed };
    };
    const count = Math.ceil(object.length / 4) + 1;
    return { at, velocity, points: Array.from({ length: count }, (_, index) => at(index / (count - 1))) };
  }
  const sliders = objects.filter(point => point.curve);
  for (const slider of sliders) {
    slider.start = slider.hit;
    slider.path = pathFor(slider);
  }
  const final = objects.at(-1);
  const circles = objects.filter(point => !point.curve && point !== final);
  const anchors = [{ x: 138, y: 148, hit: 0 }];
  for (const object of objects) {
    anchors.push({ x: object.x, y: object.y, hit: object.hit, velocity: object.path?.velocity(0) });
    if (object.path) anchors.push({ ...object.path.at(1), hit: object.end, velocity: object.path.velocity(1) });
  }
  const tangents = anchors.map((point, index) => {
    if (point.velocity) return point.velocity;
    if (!index || index === anchors.length - 1) return { x: 0, y: 0 };
    const previous = anchors[index - 1], next = anchors[index + 1];
    return { x: (next.x - previous.x) / (next.hit - previous.hit), y: (next.y - previous.y) / (next.hit - previous.hit) };
  });
  // Danser-style sweeps keep momentum through hits and bow outward between
  // jumps. Their position and derivative are zero at both ends; tight triples
  // get no wide flourish, and the cursor joins each slider tangentially.
  const sweeps = anchors.slice(1).map((point, index) => {
    const previous = anchors[index], next = anchors[index + 2] ?? point;
    const dx = point.x - previous.x, dy = point.y - previous.y;
    const distance = Math.hypot(dx, dy) || 1;
    const turn = dx * (next.y - point.y) - dy * (next.x - point.x);
    const direction = -Math.sign(turn) || (index % 2 ? -1 : 1);
    return {
      x: -dy / distance, y: dx / distance,
      bow: direction * Math.min(62, distance * .2) * clamp((point.hit - previous.hit - 80) / 100)
    };
  });
  function cursorAt(time) {
    for (const slider of sliders) {
      if (time >= slider.start && time <= slider.end) return slider.path.at((time - slider.start) / slider.duration);
    }
    const next = anchors.findIndex(point => point.hit >= time);
    if (next === 0) return anchors[0];
    if (next === -1) return final;
    if (anchors[next].hit === time) return anchors[next];
    const a = anchors[next - 1], b = anchors[next], duration = b.hit - a.hit;
    const t = clamp((time - a.hit) / duration), t2 = t * t, t3 = t2 * t;
    const from = tangents[next - 1], to = tangents[next];
    const sweep = sweeps[next - 1], bow = sweep.bow * Math.sin(Math.PI * t) ** 2;
    return {
      x: (2 * t3 - 3 * t2 + 1) * a.x + (t3 - 2 * t2 + t) * duration * from.x
        + (-2 * t3 + 3 * t2) * b.x + (t3 - t2) * duration * to.x + sweep.x * bow,
      y: (2 * t3 - 3 * t2 + 1) * a.y + (t3 - 2 * t2 + t) * duration * from.y
        + (-2 * t3 + 3 * t2) * b.y + (t3 - t2) * duration * to.y + sweep.y * bow
    };
  }
  const events = beatmap.ss.events.map(event => ({ ...event, time: event.time - offset }));
  window.IntroTimeline = Object.freeze({
    duration: final.hit + 1040, beatmap, offset, approachRate, approach, fadeIn: 380, diameter,
    objects, circles, sliders, final, events, qualityAt: sliders[0].start,
    clamp, ease, mix, cursorAt
  });
})();
