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
      for (let number = 1; number <= 4; number++) image(`default-${number}@2x`);
      const hits = [...T.circles.map(point => point.hit), T.slider.start, T.final.hit];
      const circles = [...T.circles, { ...T.slider.points[0], hit: T.slider.start, number: 4 }];
      const trailInterval = 1000 / 30;
      let trailSample = -1;
      let trailPoints = [];
      let disposed = false;

      // The slider never changes shape. Rasterize its three strokes once.
      const track = document.createElement('canvas');
      track.width = 630;
      track.height = 375;
      const ink = track.getContext('2d');
      if (ink) {
        ink.setTransform(1.5, 0, 0, 1.5, 270, 30);
        const [a, b, c, d] = T.slider.points;
        ink.beginPath();
        ink.moveTo(a.x, a.y);
        ink.bezierCurveTo(b.x, b.y, c.x, c.y, d.x, d.y);
        ink.lineCap = 'round';
        for (const [width, color, opacity] of [[110, '#505050', .8], [104, '#000', 1], [6, '#aaa', .5]]) {
          ink.lineWidth = width;
          ink.strokeStyle = color;
          ink.globalAlpha = opacity;
          if (width === 6) ink.setLineDash([0, 48]);
          ink.stroke();
        }
      }
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
        const sliderAge = time - T.slider.end;
        const trackOpacity = T.clamp((time - (T.slider.start - T.approach)) / T.fadeIn) * (1 - T.clamp(sliderAge / 200));
        if (trackOpacity > 0 && ink) {
          context.globalAlpha = trackOpacity;
          context.drawImage(track, -180, -20, 420, 250);
        }
        const sliding = time >= T.slider.start && time <= T.slider.end;
        for (const point of circles) {
          const until = point.hit - time, age = -until;
          if (until > T.approach || age >= 260) continue;
          const opacity = T.clamp((T.approach - until) / T.fadeIn);
          const faceOpacity = opacity * (1 - T.clamp(age / 130));
          if (faceOpacity > 0 && !(point.number === 4 && sliding)) {
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
        if (sliding) {
          const point = T.sliderAt((time - T.slider.start) / (T.slider.end - T.slider.start));
          circle(point.x, point.y, radius * 1.35, '#ffffff1a', '#fff', 2, 1);
          circle(point.x, point.y, radius * .85, '#aaa', '#fff', 3, 1);
        }
        ripple(T.slider.points[3], sliderAge, 260, .6, 24);
        ring(T.final, T.final.hit - time, T.clamp((time - T.final.hit + T.approach) / T.fadeIn));
        ripple(T.final, time - T.final.hit, 300, .6, 28);
        const opacity = T.clamp((time - 100) / 180) * (1 - T.clamp((time - T.final.hit) / 180));
        if (opacity > 0) {
          // Reuse positions between the fixed 30 Hz trail samples.
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
        track.width = track.height = 0;
        images.clear();
        trailPoints.length = 0;
      }
      return { draw, dispose };
    }
  };
})();
