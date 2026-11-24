/* A native, scrollable photo stream. Only the visible gallery owns an animation frame. */
(() => {
  'use strict';
  const locations = window.PHOTOGRAPHY_LOCATIONS || [];
  const photos = window.PHOTOGRAPHY_PHOTOS || [];
  const $ = selector => document.querySelector(selector);
  const page = $('#photography-screen');
  const stream = $('#photo-stream');
  const roll = $('#photo-roll');
  const pause = $('#photo-pause');
  const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  let selected = null;
  let active = false;
  let motion = true;
  let playing = true;
  let hovered = false;
  let touching = false;
  let focused = true;
  let frame = 0;
  let lastTime = 0;
  let position = 0;
  let appliedPosition = 0;
  let cycleHeight = 0;
  let renderId = 0;
  let count = 0;
  let filterAnimation;
  let filtering = false;
  let nativeScrolling = false;
  let touchSettleTimer = 0;

  function resetTouchScroll() {
    clearTimeout(touchSettleTimer);
    nativeScrolling = touching = false;
  }

  function settleTouchScroll() {
    clearTimeout(touchSettleTimer);
    if (touching) return;
    touchSettleTimer = setTimeout(() => {
      nativeScrolling = false;
      if (active) wrapScroll();
    }, 160);
  }

  const point = location => ({ x: 20 + (location.longitude - 128) * 33, y: 20 + (46 - location.latitude) * 40 });
  function shuffled(list) {
    const result = [...list];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function buildMap() {
    $('#photo-map-lines').innerHTML = locations.map(location => {
      const { x, y } = point(location);
      const [labelX, labelY] = location.label;
      return `<path data-city-line="${location.id}" d="M${x},${y} L${labelX},${labelY}"/>`;
    }).join('');
    $('#photo-map-pins').innerHTML = locations.map(location => {
      const { x, y } = point(location);
      const total = photos.filter(photo => photo.city === location.id).length;
      return `<button class="photo-city-dot" style="left:${x / 640 * 100}%;top:${y / 670 * 100}%" data-photo-city="${location.id}" tabindex="-1" aria-hidden="true"><span></span></button><button class="photo-city-label" style="left:${location.label[0] / 640 * 100}%;top:${location.label[1] / 670 * 100}%" data-photo-city="${location.id}" aria-pressed="false" aria-controls="photo-stream"><span>${escape(location.name)}</span><small>${total}</small></button>`;
    }).join('');
    $('#photo-mobile-cities').innerHTML = locations.map(location => `<button data-photo-city="${location.id}" aria-pressed="false" aria-controls="photo-stream">${escape(location.name)}</button>`).join('');
  }

  function shouldPlay() {
    return active && focused && !filtering && motion && playing && count > 1 && cycleHeight > 0 && !hovered && !touching &&
      !document.hidden && !stream.contains(document.activeElement) && !document.querySelector('dialog[open]');
  }

  function stop() {
    cancelAnimationFrame(frame);
    frame = 0;
    lastTime = 0;
  }

  function syncPlayback() {
    if (!active || !focused || filtering || document.hidden || document.querySelector('dialog[open]')) stopMomentum();
    const enabled = shouldPlay();
    page.classList.toggle('is-playing', enabled);
    pause.disabled = count < 2 || !motion;
    pause.setAttribute('aria-pressed', String(!playing));
    pause.setAttribute('aria-label', playing ? 'Pause photo carousel' : 'Play photo carousel');
    pause.querySelector('span').textContent = playing ? 'Pause' : 'Play';
    $('#photo-stream-hint').textContent = !count ? 'A few places, a few moments.'
      : enabled ? 'Drift through. Stop anywhere.' : 'Scroll to explore · click a photo to enlarge';
    if (enabled && !frame) frame = requestAnimationFrame(tick);
    if (!enabled) stop();
  }

  function tick(time) {
    frame = 0;
    if (!shouldPlay()) { syncPlayback(); return; }
    const dt = lastTime ? Math.min(time - lastTime, 50) / 1000 : 0;
    lastTime = time;
    // Accumulate fractions independently: native scrollTop may round subpixel steps.
    if (Math.abs(stream.scrollTop - appliedPosition) > 1) position = stream.scrollTop;
    position += dt * 24;
    stream.scrollTop = position;
    appliedPosition = stream.scrollTop;
    wrapScroll();
    frame = requestAnimationFrame(tick);
  }

  function sizeLoop() {
    const first = roll.firstElementChild;
    if (!first) return;
    const previousHeight = cycleHeight;
    cycleHeight = count > 1 ? first.getBoundingClientRect().height : 0;
    const copies = cycleHeight ? Math.min(6, Math.max(3, Math.ceil(stream.clientHeight / cycleHeight) + 2)) : 1;
    while (roll.children.length > copies) roll.lastElementChild.remove();
    while (roll.children.length < copies) {
      const copy = first.cloneNode(true);
      copy.setAttribute('aria-hidden', 'true');
      copy.querySelectorAll('button').forEach(button => { button.tabIndex = -1; });
      // Repeated cards still open by pointer, but are omitted from keyboard navigation.
      roll.append(copy);
    }
    // Image loads must not relocate the viewport during native scrolling.
    if (!previousHeight && cycleHeight) stream.scrollTop += cycleHeight;
    if (previousHeight !== cycleHeight) position = appliedPosition = stream.scrollTop;
    syncPlayback();
  }

  function card(photo, index) {
    const location = locations.find(location => location.id === photo.city);
    const description = [location?.name, photo.camera].filter(Boolean).join(' • ');
    const caption = [photo.caption, description].filter(Boolean).join(' · ');
    return `<figure class="photo-card"><button class="photo-image-button" data-image="${escape(photo.src)}" data-image-alt="${escape(photo.alt)}" data-image-caption="${escape(caption)}" data-image-note="${escape(photo.note || '')}" data-image-tags="${escape(JSON.stringify(photo.tags || []))}" aria-label="Enlarge ${escape(photo.caption || location?.name + ' photograph')}"><img src="${escape(photo.preview || photo.src)}" alt="${escape(photo.alt)}"${photo.width && photo.height ? ` width="${photo.width}" height="${photo.height}"` : ''} decoding="async" loading="${index < 2 ? 'eager' : 'lazy'}"><span class="photo-enlarge" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5"/></svg></span></button><figcaption><span>${escape(photo.caption || description)}</span>${photo.caption ? `<small>${escape(description)}</small>` : ''}</figcaption></figure>`;
  }

  function updateSelection() {
    const location = locations.find(location => location.id === selected);
    $('#photo-collection-title').textContent = location ? `${({hokkaido:'北海道',ine:'伊根',kyoto:'京都',gifu:'岐阜',nagoya:'名古屋',osaka:'大阪',nara:'奈良',tokyo:'東京'})[location.id]} • ${location.name}` : 'すべて • All photos';
    $('#photo-all').setAttribute('aria-pressed', String(!selected));
    page.querySelectorAll('[data-photo-city]').forEach(button => {
      const chosen = button.dataset.photoCity === selected;
      button.classList.toggle('is-selected', chosen);
      if (!button.hasAttribute('aria-hidden')) button.setAttribute('aria-pressed', String(chosen));
    });
    page.querySelectorAll('[data-city-line]').forEach(line => line.classList.toggle('is-selected', line.dataset.cityLine === selected));
    const title = selected ? location.name : 'Japan';
    $('#photo-location-label').textContent = title;
  }

  async function select(city = null, animate = true) {
    if (city && !locations.some(location => location.id === city)) return;
    selected = city;
    resetTouchScroll();
    updateSelection();
    stopMomentum();
    cancelAnimationFrame(wheelFrame); wheelFrame = 0;
    const id = ++renderId;
    filtering = true;
    stop();
    filterAnimation?.cancel();
    const list = shuffled(photos.filter(photo => !city || photo.city === city));
    stream.setAttribute('aria-busy', 'true');
    syncPlayback();
    if (animate && active && motion && roll.childElementCount) {
      filterAnimation = roll.animate([{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(-1.25rem)' }], { duration: 180, easing: 'ease-out', fill: 'forwards' });
      await filterAnimation.finished.catch(() => {});
      if (id !== renderId) return;
    }
    filterAnimation?.cancel();
    count = list.length;
    cycleHeight = 0;
    $('#photo-count').textContent = `${count} ${count === 1 ? 'photo' : 'photos'}`;
    $('#photo-empty').hidden = !!count;
    $('#photo-empty-location').textContent = selected ? locations.find(location => location.id === selected).name : 'Japan';
    roll.innerHTML = count ? `<div class="photo-cycle">${list.map(card).join('')}</div>` : '';
    stream.scrollTop = position = appliedPosition = 0;
    stream.removeAttribute('aria-busy');
    filtering = false;
    if (animate && active && motion && count) filterAnimation = roll.animate([{ opacity: 0, transform: 'translateY(1.25rem)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 360, easing: 'cubic-bezier(.16,1,.3,1)' });
    if (roll.firstElementChild && observer) observer.observe(roll.firstElementChild);
    sizeLoop();
    syncPlayback();
  }

  let wheelFrame = 0, wheelTarget = 0, drag = null, suppressClick = false;
  let momentumFrame = 0, momentumVelocity = 0, momentumTime = 0, momentumPosition = 0;
  function stopMomentum() {
    cancelAnimationFrame(momentumFrame);
    momentumFrame = 0;
    momentumVelocity = 0;
  }
  function coast(time) {
    momentumFrame = 0;
    if (!active || !focused || filtering || document.hidden) { stopMomentum(); return; }
    const dt = Math.min(Math.max(0, time - momentumTime), 50);
    momentumTime = time;
    // Integrate exponential friction: speed only decreases, independently of refresh rate.
    const decay = Math.exp(-dt / 325);
    momentumPosition += momentumVelocity * 325 * (1 - decay);
    momentumVelocity *= decay;
    stream.scrollTop = momentumPosition;
    const beforeWrap = stream.scrollTop;
    wrapScroll();
    momentumPosition += stream.scrollTop - beforeWrap;
    if (Math.abs(momentumVelocity) > .015 && (cycleHeight || Math.abs(stream.scrollTop - momentumPosition) < 1)) {
      momentumFrame = requestAnimationFrame(coast);
    } else stopMomentum();
  }
  function wrapScroll() {
    if (!cycleHeight || filtering || nativeScrolling) return;
    let shift = 0;
    if (stream.scrollTop < cycleHeight * .5) shift = cycleHeight;
    else if (stream.scrollTop > cycleHeight * 1.5) shift = -cycleHeight;
    if (shift) {
      stream.scrollTop += shift;
      wheelTarget += shift;
      position = appliedPosition = stream.scrollTop;
    }
  }
  stream.addEventListener('scroll', () => {
    // Recentring scrollTop during iPad momentum interrupts native scrolling and
    // can flash unpainted tiles. Wait until the gesture and inertia have ended.
    if (nativeScrolling) settleTouchScroll();
    else wrapScroll();
  }, { passive: true });
  stream.addEventListener('dragstart', event => event.preventDefault());
  stream.addEventListener('pointerdown', event => {
    if (event.pointerType === 'touch' || event.button !== 0) return;
    stopMomentum();
    cancelAnimationFrame(wheelFrame); wheelFrame = 0;
    drag = { y: event.clientY, time: event.timeStamp, velocity: 0, moved: false, id: event.pointerId };
    playing = false; syncPlayback();
  });
  stream.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    const delta = drag.y - event.clientY;
    if (!drag.moved && Math.abs(delta) < 4) return;
    drag.moved = true;
    stream.setPointerCapture?.(drag.id);
    event.preventDefault();
    stream.scrollTop += delta;
    const dt = event.timeStamp - drag.time;
    // Use the latest cursor speed, without adding a boost on release.
    if (dt > 0) drag.velocity = delta / dt;
    drag.time = event.timeStamp;
    drag.y = event.clientY;
    wrapScroll();
  });
  function releaseDrag(event) {
    if (!drag || event.pointerId !== drag.id) return;
    suppressClick = drag.moved;
    const released = drag;
    drag = null;
    if (stream.hasPointerCapture?.(released.id)) stream.releasePointerCapture(released.id);
    if (event.type !== 'pointerup' || !released.moved) return;
    // Holding still before release dissipates the throw instead of reviving stale speed.
    momentumVelocity = released.velocity * Math.max(0, 1 - (event.timeStamp - released.time) / 80);
    if (Math.abs(momentumVelocity) <= .015) return;
    momentumPosition = stream.scrollTop;
    momentumTime = event.timeStamp;
    momentumFrame = requestAnimationFrame(coast);
  }
  stream.addEventListener('pointerup', releaseDrag);
  stream.addEventListener('pointercancel', releaseDrag);
  stream.addEventListener('lostpointercapture', releaseDrag);
  stream.addEventListener('click', event => {
    if (suppressClick) { event.preventDefault(); event.stopPropagation(); suppressClick = false; }
  }, true);
  function smoothWheel(time) {
    wheelFrame = 0;
    if (!active || filtering) return;
    const delta = wheelTarget - stream.scrollTop;
    stream.scrollTop += delta * .22;
    wrapScroll();
    if (Math.abs(wheelTarget - stream.scrollTop) > 1) wheelFrame = requestAnimationFrame(smoothWheel);
    else stream.scrollTop = wheelTarget;
  }
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(sizeLoop) : null;
  observer?.observe(stream);
  page.addEventListener('click', event => {
    const target = event.target.closest('[data-photo-city],#photo-all');
    if (target) {
      observer?.disconnect();
      observer?.observe(stream);
      select(target.id === 'photo-all' || target.dataset.photoCity === selected ? null : target.dataset.photoCity);
    }
  });
  pause.addEventListener('click', () => { playing = !playing; syncPlayback(); });
  stream.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') { hovered = true; syncPlayback(); } });
  stream.addEventListener('pointerleave', () => { hovered = false; syncPlayback(); });
  stream.addEventListener('touchstart', () => {
    clearTimeout(touchSettleTimer);
    nativeScrolling = touching = true;
    playing = false;
    syncPlayback();
  }, { passive: true });
  const endTouch = () => { touching = false; settleTouchScroll(); syncPlayback(); };
  stream.addEventListener('touchend', endTouch, { passive: true });
  stream.addEventListener('touchcancel', endTouch, { passive: true });
  stream.addEventListener('focusin', syncPlayback);
  stream.addEventListener('focusout', () => queueMicrotask(syncPlayback));
  stream.addEventListener('wheel', event => {
    if (event.ctrlKey || !event.deltaY || filtering) return;
    stopMomentum();
    event.preventDefault(); playing = false; syncPlayback();
    if (!wheelFrame) wheelTarget = stream.scrollTop;
    wheelTarget += event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? stream.clientHeight : 1);
    if (cycleHeight) wheelTarget = Math.max(stream.scrollTop - cycleHeight * .4, Math.min(stream.scrollTop + cycleHeight * .4, wheelTarget));
    else wheelTarget = Math.max(0, Math.min(stream.scrollHeight - stream.clientHeight, wheelTarget));
    if (!wheelFrame) wheelFrame = requestAnimationFrame(smoothWheel);
  }, { passive: false });
  roll.addEventListener('load', event => {
    // A wrap can bring a distant copy onscreen in one step. Once a preview is
    // cached, ready its matching copies instead of waiting for lazy loading
    // after the jump. Unseen photos still load lazily.
    const source = event.target.getAttribute('src');
    if (source) roll.querySelectorAll('img').forEach(image => {
      if (image.getAttribute('src') === source && image.getAttribute('loading') !== 'eager') image.setAttribute('loading', 'eager');
    });
    sizeLoop();
  }, true);
  roll.addEventListener('error', event => { event.target.closest('.photo-image-button')?.classList.add('image-unavailable'); }, true);
  document.addEventListener('visibilitychange', syncPlayback);
  document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('close', syncPlayback));
  const dialogObserver = typeof MutationObserver === 'function' ? new MutationObserver(syncPlayback) : null;
  document.querySelectorAll('dialog').forEach(dialog => dialogObserver?.observe(dialog, { attributes: true, attributeFilter: ['open'] }));
  window.addEventListener('blur', () => { focused = false; syncPlayback(); });
  window.addEventListener('focus', () => { focused = true; syncPlayback(); });
  window.addEventListener('resize', sizeLoop, { passive: true });

  window.PhotoGallery = {
    setActive(value) {
      active = value;
      window.PhotoMapIntro?.setActive(value);
      resetTouchScroll();
      stopMomentum();
      cancelAnimationFrame(wheelFrame); wheelFrame = 0; drag = null;
      if (!active) { ++renderId; filterAnimation?.cancel(); stream.removeAttribute('aria-busy'); }
      else { select(selected, false); }
      syncPlayback();
    },
    setMotion(value) { motion = value; window.PhotoMapIntro?.setMotion(value); if (!value) filterAnimation?.finish(); syncPlayback(); }
  };
  buildMap();
  updateSelection();
})();
