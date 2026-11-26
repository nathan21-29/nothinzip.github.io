/* A single deterministic clock drives hit objects, skin cursor, and the real menu logo. */
(() => {
  'use strict';
  const intro = window.SiteIntro;
  if (!intro?.active) return;
  const root = document.documentElement;
  const T = window.IntroTimeline;
  const benchmark = window.IntroPerformance?.create(intro);
  const restores = [];
  let frame = 0;
  let field;
  let starBurst;
  let gameplay;
  let hud;
  let lastPaint;
  const frameInterval = 1000 / 75;
  const tailInterval = 1000 / 50;
  let burstTail = false;
  let motionObserver;
  const properties = new Map();
  // Inherited variables on :root invalidate styles throughout the entire site.
  // Keep each changing value on the small subtree that actually consumes it.
  const owners = new Map();
  for (const [names, selector] of [
    ['logo-scale logo-opacity', '.cookie-pulse'],
    ['skin-opacity number', '#main-cookie'], ['depth', '.intro-logo-surface'],
    ['facets', '.cookie-facets'], ['word word-scale', '.cookie-word'],
    ['spectrum spectrum-scale', '.cookie-spectrum'], ['halo', '.cookie-halo'],
    ['background', '.world, .bottom-bar'], ['profile profile-y', '.topbar'],
    ['footer footer-y', '.bottom-bar > *'], ['hint', '.home-tip'],
    ['ui-visibility', '.topbar, .bottom-bar > *, .home-tip']
  ]) {
    const elements = [...document.querySelectorAll(selector)];
    for (const name of names.split(' ')) owners.set(name, elements);
  }
  const set = (name, value) => {
    const text = String(value);
    if (properties.get(name) === text) return;
    properties.set(name, text);
    for (const element of owners.get(name)) element.style.setProperty('--intro-' + name, text);
  };
  // Advance the paint deadline without catching up missed frames or speeding playback up.
  function shouldPaint(timestamp, interval) {
    if (lastPaint !== undefined && timestamp - lastPaint < interval - .5) return false;
    lastPaint = lastPaint === undefined ? timestamp
      : lastPaint + Math.max(1, Math.floor((timestamp - lastPaint + .5) / interval)) * interval;
    return true;
  }
  let start;
  let lastTime = 0;
  let skipping;

  function clearField(status = 'interrupted') {
    cancelAnimationFrame(frame);
    gameplay?.dispose();
    hud?.dispose();
    starBurst?.dispose();
    field?.remove();
    intro.effectsActive = false;
    if (!intro.active) intro.settle();
    benchmark?.finish(status);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('hashchange', onHistoryChange);
    window.removeEventListener('popstate', onHistoryChange);
  }
  function release() {
    delete intro.animateSkip;
    if (!burstTail) clearField();
    motionObserver?.disconnect();
    for (const [element, inert] of restores) element.inert = inert;
    // Restart at scale 1, the same pose as the end of the morph.
    for (const name of properties.keys()) {
      for (const element of owners.get(name)) element.style.removeProperty('--intro-' + name);
    }
    properties.clear();
  }
  intro.onFinish(release);
  function onResize() { clearField(); intro.finish(); }
  function onHistoryChange() { clearField(); intro.finish(); }
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
    // Preserve the map's coordinates and fit every approach ring around the
    // centre. The menu logo stays at its normal centre throughout the reveal.
    const padding = T.diameter * 2.15 / 2;
    const scale = Math.min(1.12, (center.x - 14) / (256 + padding),
      (innerWidth - center.x - 14) / (256 + padding),
      (center.y - 24) / (192 + padding), (innerHeight - center.y - 42) / (192 + padding));
    const hitScale = T.diameter * scale / rect.width;
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
      if (reduced) { set('footer', progress); set('hint', progress); }
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
        if (p < 1 && !shouldPaint(time, frameInterval)) { frame = requestAnimationFrame(fade); return; }
        reveal(p, true);
        set('logo-opacity', p); set('word', 1); set('word-scale', 1);
        set('facets', .7); set('depth', 1);
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
    field.innerHTML = '<p class="intro-skip">Click or Enter to skip</p>';
    document.body.append(field);
    intro.effectsActive = true;
    hud = window.IntroHUD.create(field, T, innerWidth, innerHeight);
    const skip = field.querySelector('.intro-skip');
    starBurst = window.IntroStars.create(field, T, innerWidth, innerHeight);
    if (!starBurst.context) { intro.finish(); return; }
    const burstEnd = starBurst.end;
    gameplay = window.IntroGameplay.create(starBurst.context, T, center, scale);
    function draw(time, skipAge = 0) {
      hud.draw(time);
      const age = time - T.final.hit;
      const morph = T.ease(age / 680);
      set('logo-scale', T.mix(hitScale, 1, morph));
      set('logo-opacity', T.clamp(age / 100));
      set('skin-opacity', 1 - morph);
      set('number', 0);
      set('facets', .7 * T.ease((age - 100) / 440));
      set('word', T.ease((age - 180) / 420));
      set('word-scale', T.mix(.88, 1, T.ease((age - 180) / 500)));
      set('depth', morph); set('halo', T.ease((age - 330) / 520));
      set('spectrum', T.ease((age - 320) / 600));
      set('spectrum-scale', T.mix(.72, 1, T.ease((age - 320) / 600)));
      if (age >= 280 && root.dataset.intro !== 'settling') root.dataset.intro = 'settling';
      const profile = T.clamp((age - 280) / 650);
      const footer = T.clamp((age - 360) / 650);
      reveal(profile);
      starBurst.beginFrame();
      starBurst.draw(time);
      // Freeze the last painted notes/cursor while fading them independently
      // of the ending clock that folds the HUD and reveals the menu.
      gameplay.draw(skipping ? skipping.time : time, skipping ? 1 - T.clamp(skipAge / 100) : 1);
      set('footer', T.ease(footer)); set('hint', T.ease((age - 660) / 360));
      // Fast ease-out with one small, damped settle, matching the menu transitions.
      const settle = progress => progress < .7 ? T.mix(-1, .018, T.ease(progress / .7)) : .018 * (1 - T.ease((progress - .7) / .3));
      set('profile-y', `${(rect.top + 150) * settle(profile)}px`);
      set('footer-y', `${-110 * settle(footer)}px`);
      skip.style.opacity = String(.6 * (1 - T.clamp((age + 20) / 250)));
    }
    // Let the remaining confetti fall over the usable menu after the reveal completes.
    const tickBurstTail = timestamp => {
      try {
        const time = timestamp - start;
        if (time >= burstEnd || document.hidden || document.body.classList.contains('reduced-motion')) {
          clearField(time >= burstEnd ? 'completed' : 'interrupted');
          return;
        }
        if (shouldPaint(timestamp, tailInterval)) {
          starBurst.beginFrame();
          starBurst.draw(time);
          benchmark?.paint('stars', timestamp);
        }
        frame = requestAnimationFrame(tickBurstTail);
      } catch {
        clearField();
      }
    };
    const tick = timestamp => {
      if (!intro.active) return;
      try {
        if (start === undefined) {
          start = timestamp;
          benchmark?.begin('gameplay', timestamp);
        }
        if (skipping && skipping.at === undefined) {
          skipping.at = timestamp;
          start = timestamp - Math.max(T.final.hit, skipping.time);
        }
        const time = intro.reviewTime ?? Math.min(T.duration, timestamp - start);
        if (intro.reviewTime !== null || time >= T.duration || shouldPaint(timestamp, frameInterval)) {
          draw(time, skipping ? timestamp - skipping.at : 0);
          lastTime = time;
          benchmark?.paint('gameplay', timestamp);
        }
        if (time >= T.duration && intro.reviewTime === null) {
          burstTail = true;
          gameplay.dispose();
          hud.dispose();
          skip.remove();
          lastPaint = timestamp;
          benchmark?.begin('stars', timestamp);
          intro.finish();
          frame = requestAnimationFrame(tickBurstTail);
        }
        else if (intro.reviewTime === null) frame = requestAnimationFrame(tick);
      } catch (error) {
        console.warn('Startup animation ended early.', error);
        intro.finish();
      }
    };
    intro.animateSkip = () => {
      if (skipping) return;
      skipping = { time: lastTime };
      intro.reviewTime = null;
      cancelAnimationFrame(frame);
      lastPaint = undefined;
      frame = requestAnimationFrame(tick);
    };
    draw(0);
    frame = requestAnimationFrame(tick);
  } catch (error) {
    console.warn('Startup animation unavailable.', error);
    intro.finish();
  }
})();
