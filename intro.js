/* A single deterministic clock drives hit objects, skin cursor, and the real menu logo. */
(() => {
  'use strict';
  const intro = window.SiteIntro;
  if (!intro?.active) return;
  const root = document.documentElement;
  const T = window.IntroTimeline;
  const svgNS = 'http://www.w3.org/2000/svg';
  const restores = [];
  let frame = 0;
  let field;
  let motionObserver;
  const set = (name, value) => root.style.setProperty(`--intro-${name}`, String(value));
  const groups = [];
  const radius = T.diameter / 2;
  let start;

  function release() {
    cancelAnimationFrame(frame);
    field?.remove();
    motionObserver?.disconnect();
    window.removeEventListener('resize', onResize);
    window.removeEventListener('hashchange', onHistoryChange);
    window.removeEventListener('popstate', onHistoryChange);
    for (const [element, inert] of restores) element.inert = inert;
    // Restart at scale 1, the same pose as the end of the morph.
    for (const property of [...root.style]) if (property.startsWith('--intro-')) root.style.removeProperty(property);
  }
  intro.onFinish(release);
  function onResize() { intro.finish(); }
  function onHistoryChange() { intro.finish(); }
  function onMotionChange() { if (document.body.classList.contains('reduced-motion')) intro.finish(); }

  try {
    if (!T) throw new Error('Intro timeline unavailable');
    const cookie = document.querySelector('#main-cookie');
    const anchor = cookie.closest('.cookie-anchor');
    const rect = anchor.getBoundingClientRect();
    if (!rect.width || !rect.height) { intro.finish(); return; }
    const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    // The existing short-window menu is scrollable. Never lock an offscreen logo away.
    if (center.y > innerHeight - 70 || center.y < 100) { intro.finish(); return; }
    // Fit the approach rings as well as the circles around the actual logo center.
    const scale = Math.max(.25, Math.min(1.12, (innerWidth - 28) / 570,
      (center.y - 24) / 205, (innerHeight - center.y - 42) / 240));
    const hitScale = T.diameter * scale / rect.width;
    const rimWidth = parseFloat(getComputedStyle(root).fontSize) * .625;
    set('logo-size', `${rect.width}px`);
    for (const element of document.querySelectorAll('.topbar, #main-content, .bottom-bar')) {
      restores.push([element, element.inert]);
      element.inert = true;
    }
    // Avoid focus remaining in invisible controls when replaying from a local reload.
    if (document.activeElement !== document.body) document.activeElement?.blur();
    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('hashchange', onHistoryChange);
    window.addEventListener('popstate', onHistoryChange);
    motionObserver = new MutationObserver(onMotionChange);
    motionObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

    function reveal(time, reduced = false) {
      const progress = T.ease(time);
      set('ui-visibility', 'visible');
      set('profile', progress);
      set('footer', progress);
      set('hint', progress);
      set('background', progress);
      if (reduced) {
        set('profile-y', '0px'); set('footer-y', '0px');
      }
    }

    if (intro.reduced || document.body.classList.contains('reduced-motion')) {
      root.dataset.intro = 'fade';
      const fade = time => {
        if (!intro.active) return;
        if (start === undefined) start = time;
        const p = T.clamp((time - start) / 180);
        reveal(p, true);
        set('logo-opacity', p); set('word', 1); set('word-scale', 1);
        set('facets', .7); set('depth', 1); set('fill', '#e66da6');
        set('spectrum', p); set('spectrum-scale', 1); set('halo', p);
        if (p === 1) intro.finish();
        else frame = requestAnimationFrame(fade);
      };
      frame = requestAnimationFrame(fade);
      return;
    }

    field = document.createElement('div');
    field.className = 'intro-playfield';
    field.setAttribute('aria-hidden', 'true');
    field.innerHTML = `<svg xmlns="${svgNS}" viewBox="0 0 ${innerWidth} ${innerHeight}"><g class="intro-composition" transform="translate(${center.x} ${center.y}) scale(${scale})"></g></svg><p class="intro-skip">Click or Enter to skip</p>`;
    document.body.append(field);
    const composition = field.querySelector('g');
    const create = (tag, attributes, parent = composition) => {
      const node = document.createElementNS(svgNS, tag);
      for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
      parent.append(node);
      return node;
    };
    // Undo the gameplay transform: bursts originate at the actual viewport edges.
    const burst = create('g', {
      class: 'intro-star-burst',
      transform: `scale(${1 / scale}) translate(${-center.x} ${-center.y})`
    });
    const flash = create('rect', {
      class: 'intro-hit-flash', x: 0, y: 0, width: innerWidth, height: innerHeight,
      fill: '#fff', opacity: 0
    }, burst);
    const starPoints = Array.from({ length: 10 }, (_, index) => {
      const angle = index * Math.PI / 5 - Math.PI / 2;
      const r = index % 2 ? .44 : 1;
      return `${Math.cos(angle) * r},${Math.sin(angle) * r}`;
    }).join(' ');
    const starsPerSide = innerWidth < 600 ? 24 : 42;
    const stars = [];
    // Fixed variations keep replay frames stable without a second animation loop.
    const variation = (index, salt) => ((index * salt + 17) % 101) / 100;
    for (const side of [-1, 1]) {
      for (let index = 0; index < starsPerSide; index++) {
        const seed = index + (side === 1 ? 47 : 0);
        stars.push({
          node: create('polygon', { points: starPoints, class: 'intro-burst-star', opacity: 0 }, burst),
          side,
          delay: variation(seed, 37) * 130,
          lifetime: 700 + variation(seed, 29) * 170,
          y: innerHeight * (.74 + variation(seed, 43) * .24),
          travel: innerWidth * (.22 + variation(seed, 61) * .26),
          rise: innerHeight * (.27 + variation(seed, 53) * .44),
          size: (3 + variation(seed, 19) ** 1.7 * 12) * Math.min(1, innerWidth / 700),
          brightness: .2 + variation(seed, 71) * .8,
          rotation: variation(seed, 31) * 360,
          spin: (variation(seed, 67) - .5) * 220
        });
      }
    }

    function drawBurst(time) {
      const hitAge = time - T.final.hit;
      flash.setAttribute('opacity', .22 * T.clamp(hitAge / 45) * (1 - T.ease((hitAge - 45) / 420)));
      for (const star of stars) {
        const age = time - T.final.hit - star.delay;
        const p = T.clamp(age / star.lifetime);
        const travel = 1 - (1 - p) ** 2;
        const x = (star.side === -1 ? -12 : innerWidth + 12) - star.side * star.travel * travel;
        const y = star.y - star.rise * (1.6 * p - .6 * p * p);
        const opacity = age < 0 ? 0 : star.brightness * T.clamp(age / 55) * (1 - T.clamp((p - .5) / .5));
        star.node.setAttribute('opacity', opacity);
        star.node.setAttribute('transform', `translate(${x} ${y}) rotate(${star.rotation + star.spin * p}) scale(${star.size * (1 - .35 * p)})`);
      }
    }
    const approach = parent => {
      const group = create('g', {}, parent);
      create('image', { href: 'assets/whitecat/approachcircle@2x.png', x: -radius, y: -radius, width: T.diameter, height: T.diameter, class: 'intro-approach-skin' }, group);
      return group;
    };
    const addCircle = (point, parent = composition) => {
      const group = create('g', { transform: `translate(${point.x} ${point.y})`, opacity: 0 }, parent);
      const face = create('g', {}, group);
      create('image', { href: 'assets/whitecat/hitcircle@2x.png', x: -radius, y: -radius, width: T.diameter, height: T.diameter, class: 'intro-skin-base' }, face);
      create('image', { href: 'assets/whitecat/hitcircleoverlay@2x.png', x: -radius, y: -radius, width: T.diameter, height: T.diameter, class: 'intro-skin-overlay' }, face);
      const numberSize = T.diameter * 100 / 256;
      create('image', { href: `assets/whitecat/default-${point.number}@2x.png`, x: -numberSize / 2, y: -numberSize / 2, width: numberSize, height: numberSize }, face);
      const ring = approach(group);
      const ripple = create('circle', { r: radius, class: 'intro-ripple', opacity: 0 }, group);
      const object = { point, group, face, ring, ripple };
      groups.push(object);
      return object;
    };
    // Slider body sits behind its head and all hit objects.
    const sliderGroup = create('g', { opacity: 0 });
    const [a, b, c, d] = T.slider.points;
    const path = `M ${a.x} ${a.y} C ${b.x} ${b.y}, ${c.x} ${c.y}, ${d.x} ${d.y}`;
    for (const className of ['intro-slider-border', 'intro-slider-track', 'intro-slider-guide']) create('path', { d: path, class: className }, sliderGroup);
    const sliderHead = addCircle({ ...a, hit: T.slider.start, number: 4 });
    const follow = create('g', { opacity: 0 });
    create('circle', { r: radius * 1.35, class: 'intro-slider-follow' }, follow);
    create('circle', { r: radius * .85, class: 'intro-slider-ball' }, follow);
    T.circles.forEach(point => addCircle(point));
    const tailRipple = create('circle', { cx: d.x, cy: d.y, r: radius, class: 'intro-ripple', opacity: 0 });
    // The fifth circle itself is #main-cookie. Only its approach ring and ripple are SVG.
    const finalRing = approach(composition);
    const finalRipple = create('circle', { r: radius, class: 'intro-ripple', opacity: 0 });
    const trail = create('g', {});
    const cursor = create('g', {});
    const cursorFallback = create('circle', { r: 10, class: 'intro-cursor-fallback' }, cursor);
    const cursorSprite = create('image', { href: 'assets/whitecat/cursor-0.7x.png', x: -45, y: -45, width: 90, height: 90 }, cursor);
    const cursorImage = new Image();
    cursorImage.onload = () => { cursorFallback.setAttribute('opacity', 0); };
    cursorImage.src = 'assets/whitecat/cursor-0.7x.png';
    const trailSprites = Array.from({ length: 10 }, () => create('image', {
      href: 'assets/whitecat/cursortrail@2x.png', x: -22.4, y: -22.4, width: 44.8, height: 44.8, opacity: 0
    }, trail));

    function drawCircle(object, time) {
      const { point, group, face, ring, ripple } = object;
      const until = point.hit - time;
      const age = time - point.hit;
      group.setAttribute('opacity', until > T.approach || age > 260 ? 0 : T.clamp((T.approach - until) / T.fadeIn));
      face.setAttribute('opacity', age < 0 ? 1 : 1 - T.clamp(age / 130));
      face.setAttribute('transform', `scale(${age < 0 ? 1 : 1 + .13 * T.ease(age / 180)})`);
      ring.setAttribute('opacity', until > 0 ? 1 : 0);
      ring.setAttribute('transform', `scale(${1 + 1.15 * T.clamp(until / T.approach)})`);
      ripple.setAttribute('opacity', age >= 0 ? .65 * (1 - T.clamp(age / 260)) : 0);
      ripple.setAttribute('r', radius + 24 * T.ease(age / 260));
    }
    function draw(time) {
      const morph = T.ease((time - T.final.hit) / 680);
      set('logo-scale', T.mix(hitScale, 1, morph));
      set('logo-opacity', T.clamp((time - (T.final.hit - T.approach)) / T.fadeIn));
      set('skin-opacity', 1 - morph);
      set('number', 1 - T.clamp((time - T.final.hit) / 130));
      // Compensate the early rim for scale, keeping its visible weight at 3px.
      set('rim', `${T.mix(0, rimWidth, morph)}px`);
      set('fill', `rgb(${T.mix(0, 230, morph)} ${T.mix(0, 109, morph)} ${T.mix(0, 166, morph)})`);
      set('facets', .7 * T.ease((time - 2920) / 440));
      set('word', T.ease((time - 3000) / 420));
      set('word-scale', T.mix(.88, 1, T.ease((time - 3000) / 500)));
      set('depth', morph); set('halo', T.ease((time - 3150) / 520));
      set('spectrum', T.ease((time - 3140) / 600));
      set('spectrum-scale', T.mix(.72, 1, T.ease((time - 3140) / 600)));
      if (time >= 3100) root.dataset.intro = 'settling';
      const profile = T.clamp((time - 3100) / 650);
      const footer = T.clamp((time - 3180) / 650);
      reveal(profile);
      drawBurst(time);
      set('footer', T.ease(footer)); set('hint', T.ease((time - 3480) / 360));
      // Fast ease-out with one small, damped settle, matching the menu transitions.
      const settle = progress => progress < .7 ? T.mix(-1, .018, T.ease(progress / .7)) : .018 * (1 - T.ease((progress - .7) / .3));
      set('profile-y', `${(rect.top + 150) * settle(profile)}px`);
      set('footer-y', `${-110 * settle(footer)}px`);
      groups.forEach(object => drawCircle(object, time));
      const sliderAge = time - T.slider.end;
      sliderGroup.setAttribute('opacity', T.clamp((time - (T.slider.start - T.approach)) / T.fadeIn) * (1 - T.clamp(sliderAge / 200)));
      const sliding = time >= T.slider.start && time <= T.slider.end;
      const sliderPoint = T.sliderAt((time - T.slider.start) / (T.slider.end - T.slider.start));
      follow.setAttribute('opacity', sliding ? 1 : 0);
      follow.setAttribute('transform', `translate(${sliderPoint.x} ${sliderPoint.y})`);
      if (sliding) sliderHead.face.setAttribute('opacity', 0);
      tailRipple.setAttribute('opacity', sliderAge >= 0 ? .6 * (1 - T.clamp(sliderAge / 260)) : 0);
      tailRipple.setAttribute('r', radius + 24 * T.ease(sliderAge / 260));
      const untilFinal = T.final.hit - time;
      finalRing.setAttribute('opacity', untilFinal > 0 ? T.clamp((T.approach - untilFinal) / T.fadeIn) : 0);
      finalRing.setAttribute('transform', `scale(${1 + 1.15 * T.clamp(untilFinal / T.approach)})`);
      finalRipple.setAttribute('opacity', time >= T.final.hit ? .6 * (1 - T.clamp((time - T.final.hit) / 300)) : 0);
      finalRipple.setAttribute('r', radius + 28 * T.ease((time - T.final.hit) / 300));
      const cursorOpacity = T.clamp((time - 100) / 180) * (1 - T.clamp((time - T.final.hit) / 180));
      const point = T.cursorAt(time);
      cursor.setAttribute('opacity', cursorOpacity);
      const hitAge = time - Math.max(0, ...[...T.circles.map(item => item.hit), T.slider.start, T.final.hit].filter(hit => hit <= time));
      const pressScale = 1 + .12 * (1 - T.clamp(hitAge / 140));
      cursorSprite.setAttribute('transform', `scale(${pressScale})`);
      cursor.setAttribute('transform', `translate(${point.x} ${point.y})`);
      trailSprites.forEach((sprite, index) => {
        // Reconstruct fixed 60 Hz samples from the master clock, even after a slow frame.
        const sample = Math.floor(time / (1000 / 60)) * (1000 / 60) - index * (1000 / 60);
        const position = T.cursorAt(sample);
        sprite.setAttribute('transform', `translate(${position.x} ${position.y})`);
        sprite.setAttribute('opacity', sample < 100 ? 0 : cursorOpacity * .55 * (1 - T.clamp((time - sample) / 150)));
      });
      field.querySelector('.intro-skip').style.opacity = String(.6 * (1 - T.clamp((time - 2800) / 250)));
    }
    const tick = timestamp => {
      if (!intro.active) return;
      try {
        if (start === undefined) start = timestamp;
        const time = intro.reviewTime ?? Math.min(T.duration, timestamp - start);
        draw(time);
        if (time >= T.duration) intro.finish();
        else if (intro.reviewTime === null) frame = requestAnimationFrame(tick);
      } catch (error) {
        console.warn('Startup animation ended early.', error);
        intro.finish();
      }
    };
    draw(0);
    frame = requestAnimationFrame(tick);
  } catch (error) {
    console.warn('Startup animation unavailable.', error);
    intro.finish();
  }
})();
