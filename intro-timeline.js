/* Milliseconds and playfield coordinates. No game loop, input scoring, or randomness. */
(() => {
  'use strict';
  const clamp = value => Math.max(0, Math.min(1, value));
  const ease = value => 1 - (1 - clamp(value)) ** 4;
  const mix = (a, b, t) => a + (b - a) * t;
  const circles = [
    { x: -185, y: 65, hit: 620, number: 1 },
    { x: -110, y: -105, hit: 1020, number: 2 },
    { x: 105, y: -95, hit: 1420, number: 3 }
  ];
  const slider = { start: 1820, end: 2420, points: [
    { x: 180, y: 65 }, { x: 120, y: 175 }, { x: -145, y: 150 }, { x: -115, y: 40 }
  ] };
  const final = { x: 0, y: 0, hit: 2820, number: 5 };
  function sliderAt(progress) {
    const t = clamp(progress), u = 1 - t;
    const [a, b, c, d] = slider.points;
    return {
      x: u ** 3 * a.x + 3 * u ** 2 * t * b.x + 3 * u * t ** 2 * c.x + t ** 3 * d.x,
      y: u ** 3 * a.y + 3 * u ** 2 * t * b.y + 3 * u * t ** 2 * c.y + t ** 3 * d.y
    };
  }
  const anchors = [{ x: -235, y: 110, hit: 120 }, ...circles,
    { ...slider.points[0], hit: slider.start }, { ...slider.points[3], hit: slider.end }, final];
  const tangents = anchors.map((point, index) => {
    if (index === 0 || index === anchors.length - 1) return { x: 0, y: 0 };
    if (index === 4 || index === 5) {
      const [a, b, c, d] = slider.points;
      const from = index === 4 ? a : c, to = index === 4 ? b : d;
      return { x: 3 * (to.x - from.x) / (slider.end - slider.start), y: 3 * (to.y - from.y) / (slider.end - slider.start) };
    }
    const previous = anchors[index - 1], next = anchors[index + 1];
    return { x: (next.x - previous.x) / (next.hit - previous.hit), y: (next.y - previous.y) / (next.hit - previous.hit) };
  });
  // Shared tangents carry momentum through hits. Small signed flourishes bow each
  // sweep outward, inspired by cursor-dance visualizers, without missing a beat.
  const flourishes = [22, -42, -52, -36, 0, -24];
  function cursorAt(time) {
    if (time >= slider.start && time <= slider.end) return sliderAt((time - slider.start) / (slider.end - slider.start));
    const next = anchors.findIndex(point => point.hit >= time);
    if (next === 0) return anchors[0];
    if (next === -1) return final;
    if (anchors[next].hit === time) return anchors[next];
    const a = anchors[next - 1], b = anchors[next];
    const duration = b.hit - a.hit;
    const t = clamp((time - a.hit) / duration), t2 = t * t, t3 = t2 * t;
    const from = tangents[next - 1], to = tangents[next];
    const distance = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const bow = flourishes[next - 1] * Math.sin(Math.PI * t) ** 2;
    return {
      x: (2 * t3 - 3 * t2 + 1) * a.x + (t3 - 2 * t2 + t) * duration * from.x
        + (-2 * t3 + 3 * t2) * b.x + (t3 - t2) * duration * to.x - (b.y - a.y) / distance * bow,
      y: (2 * t3 - 3 * t2 + 1) * a.y + (t3 - 2 * t2 + t) * duration * from.y
        + (-2 * t3 + 3 * t2) * b.y + (t3 - t2) * duration * to.y + (b.x - a.x) / distance * bow
    };
  }
  window.IntroTimeline = Object.freeze({ duration: 3860, approach: 650, diameter: 82, circles, slider, final, clamp, ease, mix, sliderAt, cursorAt });
})();
