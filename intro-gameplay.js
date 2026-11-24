/* Gameplay shares the burst canvas; only the real menu logo and 3D HUD stay in DOM. */
(() => {
  'use strict';
  window.IntroGameplay = {
    create(context, T, center, scale) {
      const radius = T.diameter / 2;
      const images = new Map();
      const image = file => {
        if (!images.has(file)) {
          const sprite = new Image();
          sprite.src = `assets/whitecat/${file}.png`;
          images.set(file, sprite);
        }
        return images.get(file);
      };
      const base = image('hitcircle@2x');
      const overlay = image('hitcircleoverlay@2x');
      const approach = image('approachcircle@2x');
      const cursor = image('cursor-0.7x');
      const trail = image('cursortrail@2x');
      for (let number = 1; number <= 9; number++) image(`default-${number}@2x`);
      const hits = T.objects.map(point => point.hit);
      const trailInterval = 1000 / 30;
      let trailSample = -1, trailPoints = [], disposed = false;
      // Each of the five perfect-circle sliders is rasterized once, tightly
      // bounded to its own curve. The visible playfield still uses one canvas.
      const tracks = T.sliders.map(slider => {
        const points = slider.path.points, padding = radius + 4;
        const left = Math.min(...points.map(p => p.x)) - padding;
        const top = Math.min(...points.map(p => p.y)) - padding;
        const width = Math.max(...points.map(p => p.x)) + padding - left;
        const height = Math.max(...points.map(p => p.y)) + padding - top;
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(width * 1.5);
        canvas.height = Math.ceil(height * 1.5);
        const ink = canvas.getContext('2d');
        if (ink) {
          ink.setTransform(1.5, 0, 0, 1.5, -left * 1.5, -top * 1.5);
          ink.beginPath();
          points.forEach((point, index) => index ? ink.lineTo(point.x, point.y) : ink.moveTo(point.x, point.y));
          ink.lineCap = ink.lineJoin = 'round';
          for (const [strokeWidth, color, opacity] of [[T.diameter, '#505050', .8], [T.diameter - 6, '#000', 1], [6, '#aaa', .5]]) {
            ink.lineWidth = strokeWidth;
            ink.strokeStyle = color;
            ink.globalAlpha = opacity;
            if (strokeWidth === 6) ink.setLineDash([0, 48]);
            ink.stroke();
          }
        }
        return { slider, canvas, ink, left, top, width, height };
      });
      function sprite(source, size, opacity = 1) {
        if (opacity <= 0 || !source.complete || !source.naturalWidth) return false;
        context.globalAlpha = opacity;
        context.drawImage(source, -size / 2, -size / 2, size, size);
        return true;
      }
      function circle(x, y, r, fill, stroke, width, opacity) {
        if (opacity <= 0) return;
        context.globalAlpha = opacity;
        context.beginPath();
        context.arc(x, y, r, 0, Math.PI * 2);
        if (fill) { context.fillStyle = fill; context.fill(); }
        if (stroke) { context.strokeStyle = stroke; context.lineWidth = width; context.stroke(); }
      }
      function ripple(point, age, duration, strength, growth) {
        if (age < 0 || age >= duration) return;
        circle(point.x, point.y, radius + growth * T.ease(age / duration), null, '#ddd', 1.5, strength * (1 - age / duration));
      }
      function ring(point, until, opacity) {
        if (until <= 0 || until > T.approach) return;
        context.save();
        context.translate(point.x, point.y);
        sprite(approach, T.diameter * (1 + 1.15 * T.clamp(until / T.approach)), opacity * .9);
        context.restore();
      }
      function draw(time) {
        if (disposed || time >= T.final.hit + 300) return;
        context.save();
        context.translate(center.x, center.y);
        context.scale(scale, scale);
        // Draw later objects first so the earliest stacked note is on top.
        for (let index = T.objects.length - 1; index >= 0; index--) {
          const point = T.objects[index];
          const until = point.hit - time, age = -until;
          if (until > T.approach || time >= point.end + 260) continue;
          const opacity = T.clamp((T.approach - until) / T.fadeIn);
          const sliding = !!point.path && time >= point.hit && time < point.end;
          if (point.path) {
            const track = tracks.find(track => track.slider === point);
            const tailAge = time - point.end;
            const trackOpacity = opacity * (1 - T.clamp(tailAge / 200));
            if (trackOpacity > 0 && track.ink) {
              context.globalAlpha = trackOpacity;
              context.drawImage(track.canvas, track.left, track.top, track.width, track.height);
            }
            if (sliding) {
              const ball = point.path.at((time - point.hit) / point.duration);
              circle(ball.x, ball.y, radius * 1.35, '#ffffff1a', '#fff', 2, 1);
              circle(ball.x, ball.y, radius * .85, '#aaa', '#fff', 3, 1);
            }
            ripple(point.path.at(1), tailAge, 260, .6, 24);
          }
          const faceOpacity = opacity * (1 - T.clamp(age / 130));
          if (faceOpacity > 0 && !sliding) {
            context.save();
            context.translate(point.x, point.y);
            const grow = 1 + .13 * T.ease(age / 180);
            context.scale(grow, grow);
            sprite(base, T.diameter, faceOpacity);
            sprite(overlay, T.diameter, faceOpacity);
            sprite(image(`default-${point.number}@2x`), T.diameter * 100 / 256, faceOpacity);
            context.restore();
          }
          ring(point, until, opacity);
          ripple(point, age, 260, .65 * opacity, 24);
        }
        const opacity = T.clamp((time - 100) / 180) * (1 - T.clamp((time - T.final.hit) / 180));
        if (opacity > 0) {
          const sample = Math.floor(time / trailInterval);
          if (sample !== trailSample) {
            trailSample = sample;
            trailPoints = Array.from({ length: 5 }, (_, index) => {
              const at = (sample - index) * trailInterval;
              return { at, ...T.cursorAt(at) };
            });
          }
          for (const point of trailPoints) {
            if (point.at < 100) continue;
            context.save();
            context.translate(point.x, point.y);
            sprite(trail, 44.8, opacity * .55 * (1 - T.clamp((time - point.at) / 150)));
            context.restore();
          }
          const point = T.cursorAt(time);
          const hit = hits.reduce((last, at) => at <= time ? at : last, 0);
          context.translate(point.x, point.y);
          if (!sprite(cursor, 90 * (1 + .12 * (1 - T.clamp((time - hit) / 140))), opacity)) {
            circle(0, 0, 10, '#ffe5f4', '#ef81ba', 3, opacity);
          }
        }
        context.restore();
      }
      function dispose() {
        if (disposed) return;
        disposed = true;
        for (const track of tracks) track.canvas.width = track.canvas.height = 0;
        images.clear();
        trailPoints.length = 0;
      }
      return { draw, dispose };
    }
  };
})();
