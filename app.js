/* Local, dependency-free portfolio. No accounts, trackers, or remote requests. */
(() => {
  'use strict';
  const projects = window.PORTFOLIO_PROJECTS || [];
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  const readPreference = name => { try { return localStorage.getItem(name); } catch { return null; } };
  const savePreference = (name, value) => { try { localStorage.setItem(name, value); } catch { /* Private/file browsing still works. */ } };
  const pointerQuery = window.matchMedia('(hover: hover) and (pointer: fine) and (min-width: 801px)');
  const preference = readPreference('nathan-motion');
  const state = {
    screen: 'home', menuOpen: false, selected: projects[0]?.id,
    filter: 'all', query: '', sort: 'featured', expanded: true,
    motion: preference !== 'off'
  };
  let navigationId = 0;
  let pendingScreen = null;
  let previouslyFocused;
  let pointerFrame = 0;
  let pointerPosition = null;
  const cursorGravity = { y: null, strength: 0, time: 0 };
  let previewRequest = 0;
  let previewAnimation;
  let previewProjectId;
  let previewTargetId;
  let backdropProjectId;
  let backdropLayer = 0;
  let backdropRequest = 0;
  const imageCache = new Map();
  let projectPreload;
  const projectScroll = { offset: 0, target: 0, velocity: 0, frame: 0, time: 0, touchY: null, releaseTimer: 0 };
  const projectPageScroll = { position: 0, target: 0, velocity: 0, frame: 0, time: 0, edgeDelta: 0 };
  const background = document.createElement('div');
  background.className = 'site-background';
  $('.world').prepend(background);
  const backdropLayers = [$('#world-image'), $('#world-image').cloneNode(false)];
  backdropLayers[1].removeAttribute('id');
  backdropLayers[0].after(backdropLayers[1]);

  function selectedProject() { return projects.find(project => project.id === state.selected) || projects[0]; }
  function visibleProjects() {
    const terms = state.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const list = projects.filter(project => {
      const haystack = [project.title, project.subtitle, project.summary, project.category, ...project.stack].join(' ').toLowerCase();
      return (state.filter === 'all' || state.filter === project.category) && terms.every(term => haystack.includes(term));
    });
    return state.sort === 'title' ? list.sort((a, b) => a.title.localeCompare(b.title)) : list;
  }

  // Keep animating until the averaged cursor height and gravity have settled.
  function queuePointerMotion() {
    if (!pointerFrame) {
      cursorGravity.time = 0;
      pointerFrame = requestAnimationFrame(updatePointerMotion);
    }
  }

  function updatePointerMotion(time) {
    pointerFrame = 0;
    const dt = cursorGravity.time ? Math.min((time - cursorGravity.time) / 1000, .05) : 1 / 60;
    cursorGravity.time = time;
    const active = state.motion && pointerQuery.matches && pointerPosition && !$$('dialog[open]').length;
    const home = active && state.screen === 'home';
    document.body.style.setProperty('--pointer-x', `${home ? (pointerPosition.x / window.innerWidth * 2 - 1).toFixed(3) : 0}px`);
    document.body.style.setProperty('--pointer-y', `${home ? (pointerPosition.y / window.innerHeight * 2 - 1).toFixed(3) : 0}px`);
    const projectsActive = active && state.screen === 'projects';
    if (projectsActive) {
      cursorGravity.y ??= pointerPosition.y;
      // A time-weighted average filters quick flicks equally at any frame rate.
      cursorGravity.y += (pointerPosition.y - cursorGravity.y) * (1 - Math.exp(-dt / .32));
      if (Math.abs(pointerPosition.y - cursorGravity.y) < .1) cursorGravity.y = pointerPosition.y;
    }
    const targetStrength = projectsActive ? 1 : 0;
    cursorGravity.strength += (targetStrength - cursorGravity.strength) * (1 - Math.exp(-dt / .24));
    if (Math.abs(targetStrength - cursorGravity.strength) < .001) cursorGravity.strength = targetStrength;
    if (!state.motion || !pointerQuery.matches || state.screen !== 'projects') {
      cursorGravity.y = null;
      cursorGravity.strength = 0;
    }
    const uiScale = parseFloat(getComputedStyle(document.documentElement).fontSize) / 16;
    const entries = $$('.song-entry').map(entry => {
      const card = entry.querySelector('.song-card').getBoundingClientRect();
      const distance = cursorGravity.y === null ? Infinity : Math.abs(cursorGravity.y - (card.top + card.height / 2));
      const proximity = Math.max(0, 1 - distance / (320 * uiScale));
      const pull = (1 - Math.cos(Math.PI * proximity)) / 2;
      return { entry, offset: -Math.min(88 * uiScale, window.innerWidth * .061) * pull * cursorGravity.strength };
    });
    for (const { entry, offset } of entries) entry.style.setProperty('--cursor-offset', `${offset.toFixed(2)}px`);
    if (cursorGravity.strength !== targetStrength || (projectsActive && cursorGravity.y !== pointerPosition.y)) {
      pointerFrame = requestAnimationFrame(updatePointerMotion);
    } else if (!projectsActive) {
      cursorGravity.y = null;
    }
  }

  function resetProjectScroll() {
    stopProjectPageScroll();
    cancelAnimationFrame(projectScroll.frame);
    clearTimeout(projectScroll.releaseTimer);
    Object.assign(projectScroll, { offset: 0, target: 0, velocity: 0, frame: 0, time: 0, touchY: null, releaseTimer: 0 });
    $('#song-list').style.setProperty('--card-recoil', '0px');
  }

  function stopProjectPageScroll() {
    cancelAnimationFrame(projectPageScroll.frame);
    projectPageScroll.frame = 0;
    projectPageScroll.velocity = 0;
    projectPageScroll.time = 0;
    projectPageScroll.edgeDelta = 0;
  }

  function smoothProjectWheel(event, delta) {
    if (!state.motion || pendingScreen || state.screen !== 'projects' || !delta || $$('dialog[open]').length) return false;
    if (!event.cancelable || event.target.closest('input,textarea,select,[contenteditable="true"]')) {
      // Do not fight native trackpad momentum when the browser owns the gesture.
      stopProjectPageScroll();
      return false;
    }
    const page = document.scrollingElement;
    if (!page) return false;
    const bottom = Math.max(0, page.scrollHeight - page.clientHeight);
    const previousTarget = projectPageScroll.frame ? projectPageScroll.target : page.scrollTop;
    const target = Math.max(0, Math.min(bottom, previousTarget + delta));
    const overscroll = previousTarget + delta - target;
    if (target === previousTarget) {
      // Recoil takes over once the page actually reaches the end of its travel.
      if (!projectPageScroll.frame || (delta < 0 ? page.scrollTop <= 1 : page.scrollTop >= bottom - 1)) {
        projectPageScroll.edgeDelta = 0;
        return false;
      }
      event.preventDefault();
      projectPageScroll.edgeDelta += overscroll;
      return true;
    }
    event.preventDefault();
    if (projectScroll.target) releaseProjectScroll();
    projectPageScroll.target = target;
    projectPageScroll.edgeDelta = overscroll;
    if (!projectPageScroll.frame) {
      projectPageScroll.position = page.scrollTop;
      projectPageScroll.velocity = 0;
      projectPageScroll.time = 0;
      projectPageScroll.frame = requestAnimationFrame(springProjectPageScroll);
    }
    return true;
  }

  function springProjectPageScroll(time) {
    const page = document.scrollingElement;
    if (!page || !state.motion || state.screen !== 'projects') { stopProjectPageScroll(); return; }
    const dt = projectPageScroll.time ? Math.min((time - projectPageScroll.time) / 1000, .05) : 1 / 60;
    projectPageScroll.time = time;
    const bottom = Math.max(0, page.scrollHeight - page.clientHeight);
    projectPageScroll.target = Math.max(0, Math.min(bottom, projectPageScroll.target));
    // Blend wheel ticks into one spring, retaining velocity instead of restarting an easing.
    const distance = projectPageScroll.position - projectPageScroll.target;
    const carry = projectPageScroll.velocity + 16 * distance;
    const decay = Math.exp(-16 * dt);
    projectPageScroll.position = Math.max(0, Math.min(bottom, projectPageScroll.target + (distance + carry * dt) * decay));
    projectPageScroll.velocity = (projectPageScroll.velocity - 16 * carry * dt) * decay;
    const settled = Math.abs(projectPageScroll.target - projectPageScroll.position) < .25 && Math.abs(projectPageScroll.velocity) < 2;
    if (settled) projectPageScroll.position = projectPageScroll.target;
    window.scrollTo({ top: projectPageScroll.position, behavior: 'instant' });
    // A trackpad gesture may finish before its eased movement reaches the edge.
    if (projectPageScroll.edgeDelta && Math.abs(projectPageScroll.target - projectPageScroll.position) < 1) {
      pullProjectScroll(projectPageScroll.edgeDelta);
      projectPageScroll.edgeDelta = 0;
    }
    if (settled) stopProjectPageScroll();
    else projectPageScroll.frame = requestAnimationFrame(springProjectPageScroll);
  }

  function queueProjectScroll() {
    if (projectScroll.frame) return;
    projectScroll.time = 0;
    projectScroll.frame = requestAnimationFrame(springProjectScroll);
  }

  function springProjectScroll(time) {
    const dt = projectScroll.time ? Math.min((time - projectScroll.time) / 1000, .05) : 1 / 60;
    projectScroll.time = time;
    // A critically damped spring preserves velocity across wheel ticks and frame rates.
    const distance = projectScroll.offset - projectScroll.target;
    const carry = projectScroll.velocity + 12 * distance;
    const decay = Math.exp(-12 * dt);
    projectScroll.offset = projectScroll.target + (distance + carry * dt) * decay;
    projectScroll.velocity = (projectScroll.velocity - 12 * carry * dt) * decay;
    const settled = Math.abs(projectScroll.target - projectScroll.offset) < .05 && Math.abs(projectScroll.velocity) < .05;
    if (settled) {
      projectScroll.offset = projectScroll.target;
      projectScroll.velocity = 0;
      projectScroll.frame = 0;
    }
    $('#song-list').style.setProperty('--card-recoil', `${(projectScroll.offset / 16).toFixed(4)}rem`);
    queuePointerMotion();
    if (!settled) projectScroll.frame = requestAnimationFrame(springProjectScroll);
  }

  function stretchProjectScroll(event, delta) {
    if (!state.motion || pendingScreen || state.screen !== 'projects' || !delta || $$('dialog[open]').length) return;
    if (event.target.closest('input,textarea,select,[contenteditable="true"]')) return;
    const page = document.scrollingElement;
    if (!page) return;
    const bottom = Math.max(0, page.scrollHeight - page.clientHeight);
    const atEdge = delta < 0 ? page.scrollTop <= 1 : page.scrollTop >= bottom - 1;
    // Let the browser scroll long pages normally until their top or bottom edge.
    if (!atEdge) {
      if (projectScroll.target) releaseProjectScroll();
      return;
    }
    if (event.cancelable) event.preventDefault();
    pullProjectScroll(delta);
  }

  function pullProjectScroll(delta) {
    // At either bound, retract the cards toward the screen edge instead of moving the page.
    const resistance = .12 * (1 - projectScroll.target / 32);
    // Small precision-trackpad deltas need enough gain to make the elastic response visible.
    const pull = Math.min(180, Math.max(12, Math.abs(delta)));
    projectScroll.target = Math.min(28, projectScroll.target + pull * resistance);
    queueProjectScroll();
    // Treat a burst of wheel ticks as one gesture, then ease back after it ends.
    clearTimeout(projectScroll.releaseTimer);
    if (projectScroll.touchY === null) projectScroll.releaseTimer = setTimeout(releaseProjectScroll, 220);
  }

  function releaseProjectScroll() {
    clearTimeout(projectScroll.releaseTimer);
    projectScroll.releaseTimer = 0;
    projectScroll.touchY = null;
    projectScroll.target = 0;
    if (projectScroll.offset || projectScroll.velocity) queueProjectScroll();
  }

  function setMotion(enabled, persist = true) {
    state.motion = enabled;
    document.body.classList.toggle('reduced-motion', !enabled);
    document.body.classList.toggle('motion-enabled', enabled);
    $('#motion-toggle').setAttribute('aria-pressed', String(enabled));
    $('#motion-toggle').setAttribute('aria-label', enabled ? 'Reduce motion' : 'Enable motion');
    $('#motion-toggle span').textContent = enabled ? 'Motion on' : 'Motion reduced';
    if (persist) savePreference('nathan-motion', enabled ? 'on' : 'off');
    queuePointerMotion();
    if (!enabled) {
      resetProjectScroll();
      if (pendingScreen) {
        ++navigationId;
        const screen = pendingScreen;
        pendingScreen = null;
        $('#transition-wipe').classList.remove('is-active');
        applyScreen(screen);
      }
      if (state.screen === 'projects') updatePreview(selectedProject(), true);
      updateBackdrop(true);
    }
  }

  function toggleMenu(force) {
    state.menuOpen = typeof force === 'boolean' ? force : !state.menuOpen;
    $('#home-stage').classList.toggle('is-open', state.menuOpen);
    $('#main-menu').inert = !state.menuOpen || state.screen !== 'home';
    $('#main-cookie').setAttribute('aria-expanded', String(state.menuOpen));
    $('#main-cookie').setAttribute('aria-label', state.menuOpen ? 'Open projects' : 'Open main menu');
    $('#cookie-caption').textContent = state.menuOpen ? 'PICK YOUR NEXT STOP' : 'CLICK TO EXPLORE';
    $('#home-tip').innerHTML = state.menuOpen
      ? '<span class="tip-dot"></span>Click the circle again for projects.<span class="tip-key"><kbd>Enter</kbd> to continue · <kbd>Esc</kbd> to close</span>'
      : '<span class="tip-dot"></span>Click the circle. There\'s more on the other side.<span class="tip-key"><kbd>Enter</kbd> works, too</span>';
    if (state.menuOpen) preloadProjectImages();
  }

  function activateCookie() {
    if (state.menuOpen) navigate('projects');
    else toggleMenu(true);
  }

  function updateBackdrop(immediate = false) {
    const project = selectedProject();
    const id = state.screen === 'projects' && project ? project.id : null;
    document.body.style.setProperty('--selected-accent', project?.accent || '#ed70a8');
    if (id === backdropProjectId && !immediate) return;
    backdropProjectId = id;
    const request = ++backdropRequest;
    if (!id) {
      backdropLayers.forEach(layer => layer.classList.remove('is-visible'));
      return;
    }
    const show = () => {
      if (request !== backdropRequest) return;
      const next = 1 - backdropLayer;
      backdropLayers[next].style.backgroundImage = `url("${project.image}")`;
      backdropLayers[next].classList.add('is-visible');
      backdropLayers[backdropLayer].classList.remove('is-visible');
      backdropLayer = next;
    };
    if (immediate || !state.motion) show();
    else loadImage(project.image).then(show);
  }

  function applyScreen(screen, focus = true) {
    resetProjectScroll();
    state.screen = screen;
    pointerPosition = null;
    queuePointerMotion();
    if (screen !== 'projects') {
      ++previewRequest;
      previewAnimation?.cancel();
      previewTargetId = null;
      $('#project-preview').removeAttribute('aria-busy');
      $('#project-preview').inert = false;
    }
    document.body.dataset.screen = screen;
    for (const name of ['home', 'projects', 'about']) $(`#${name}-screen`).hidden = name !== screen;
    $('#back-button').hidden = screen === 'home';
    $('#signature').hidden = screen !== 'home';
    $('#project-toolbar').hidden = screen !== 'projects';
    $('#launch-project').hidden = screen !== 'projects';
    $('#main-menu').inert = screen !== 'home' || !state.menuOpen;
    if (screen === 'projects') renderProjects();
    if (screen === 'home') toggleMenu(state.menuOpen);
    updateBackdrop();
    document.title = `Nathan Chan · ${screen === 'projects' ? 'project select' : screen === 'about' ? 'about me' : 'a few things I’ve made'}`;
    const panel = $(`#${screen}-screen`);
    panel.classList.remove('entering');
    requestAnimationFrame(() => panel.classList.add('entering'));
    if (focus) {
      const target = screen === 'home' ? $('#main-cookie') : panel.querySelector('h1');
      if (screen !== 'home') target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
      $('#main-content').scrollTop = 0;
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }

  function navigate(screen, { push = true } = {}) {
    if (!['home', 'projects', 'about'].includes(screen)) return;
    if (pendingScreen === screen) return;
    if (screen === 'projects') preloadProjectImages();
    const id = ++navigationId;
    if (push && location.hash !== `#${screen}`) {
      try { history.pushState({ screen }, '', `#${screen}`); } catch { /* Works directly from a local file too. */ }
    }
    if (screen === state.screen) { pendingScreen = null; $('#transition-wipe').classList.remove('is-active'); return; }
    if (screen === 'home') state.menuOpen = true;
    const wipe = $('#transition-wipe');
    if (!state.motion) { applyScreen(screen); return; }
    pendingScreen = screen;
    wipe.classList.add('is-active');
    setTimeout(() => {
      if (id !== navigationId) return;
      pendingScreen = null;
      applyScreen(screen);
      requestAnimationFrame(() => { if (id === navigationId) wipe.classList.remove('is-active'); });
    }, 280);
  }

  function loadImage(src) {
    if (imageCache.has(src)) return imageCache.get(src).ready;
    const cached = {};
    imageCache.set(src, cached);
    cached.ready = new Promise(resolve => {
      const image = new Image();
      cached.image = image;
      image.decoding = 'async';
      let settled = false;
      const finish = async () => {
        if (settled) return;
        settled = true;
        if (!image.naturalWidth) {
          imageCache.delete(src);
          resolve(false);
          return;
        }
        // Downloading alone does not make a screenshot ready for its first paint.
        try { await image.decode?.(); } catch { /* A loaded image can still render. */ }
        resolve(true);
      };
      image.onload = image.onerror = finish;
      image.src = src;
      if (image.complete) finish();
    });
    return cached.ready;
  }

  function preloadProjectImages() {
    if (projectPreload) return projectPreload;
    const featured = selectedProject();
    const queue = [...new Set([
      ...(featured?.images.map(image => image.src) || []),
      ...projects.map(project => project.image),
      ...projects.flatMap(project => project.images.map(image => image.src))
    ])];
    // Warm the selected overview first; cap concurrency so the menu stays responsive.
    const warmQueue = async () => { while (queue.length) await loadImage(queue.shift()); };
    projectPreload = Promise.all(Array.from({ length: 3 }, warmQueue));
    return projectPreload;
  }

  async function updatePreview(project, immediate = false) {
    if (!project || (project.id === previewTargetId && !immediate)) return;
    const request = ++previewRequest;
    previewTargetId = project.id;
    previewAnimation?.cancel();
    const preview = $('#project-preview');
    if (immediate || !state.motion || !previewProjectId || typeof preview.animate !== 'function') {
      renderPreview(project);
      previewProjectId = project.id;
      preview.removeAttribute('aria-busy');
      preview.inert = false;
      return;
    }
    preview.setAttribute('aria-busy', 'true');
    preview.inert = true;
    previewAnimation = preview.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 110, easing: 'ease-out', fill: 'forwards' });
    const imagesReady = Promise.all(project.images.map(image => loadImage(image.src)));
    await Promise.all([previewAnimation.finished.catch(() => {}), imagesReady]);
    if (request !== previewRequest) return;
    renderPreview(project);
    previewProjectId = project.id;
    preview.removeAttribute('aria-busy');
    preview.inert = false;
    previewAnimation.cancel();
    previewAnimation = preview.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 210, easing: 'ease-out', fill: 'forwards' });
    await previewAnimation.finished.catch(() => {});
    if (request === previewRequest) { previewAnimation.cancel(); previewAnimation = null; }
  }

  function renderPreview(project) {
    if (!project) return;
    const firstImage = project.images[0];
    const others = project.images.slice(1);
    const imageButton = (image, extraClass) => `<button class="image-button ${extraClass}" data-image="${escape(image.src)}" data-image-caption="${escape(image.caption)}" data-image-alt="${escape(image.alt)}" aria-label="Enlarge image: ${escape(image.caption)}"><img src="${escape(image.src)}" alt="${escape(image.alt)}" ${image.position ? `style="object-position:${escape(image.position)}"` : ''}><span class="image-enlarge" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5"/></svg></span></button>`;
    $('#project-preview').innerHTML = `
      <div class="preview-kicker"><span>PROJECT OVERVIEW</span><span class="project-type">${project.category === 'hardware' ? 'HARDWARE' : 'SOFTWARE'}</span></div>
      <div class="preview-heading"><h2>${escape(project.title)}</h2></div>
      <p class="preview-description">${escape(project.summary)}</p>
      <div class="collage ${others.length ? '' : 'single'}" data-kind="${escape(project.id)}">
        ${imageButton(firstImage, 'collage-hero')}
        ${others.length ? `<div class="collage-strip">${others.map(image => imageButton(image, '')).join('')}</div>` : ''}
      </div>
      <p class="image-caption">${project.images.length > 1 ? 'A closer look at the project. Click any image to explore.' : 'The actual prototype. Click the photo for the full view.'}</p>
      <dl class="project-facts">${project.facts.map(fact => `<div><dt>${escape(fact.label)}</dt><dd>${escape(fact.value)}</dd></div>`).join('')}</dl>
      ${project.repo ? `<a class="preview-link" href="${escape(project.repo)}" target="_blank" rel="noreferrer"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 8-4 4 4 4m8-8 4 4-4 4m-5 5 2-14"/></svg>Explore the source on GitHub</a>` : '<button class="preview-link" data-case-study>Read how it was built</button>'}`;
  }

  function renderProjects() {
    stopProjectPageScroll();
    const list = visibleProjects();
    if (list.length && !list.some(project => project.id === state.selected)) { state.selected = list[0].id; state.expanded = true; }
    $('#song-list').innerHTML = list.length ? list.map((project, index) => {
      const selected = state.selected === project.id;
      const expanded = selected && state.expanded;
      return `<article class="song-entry ${selected ? 'selected' : ''} ${expanded ? 'expanded' : ''}" data-project="${project.id}" style="--card-index:${index};--project-accent:${project.accent}">
        <button class="song-card" aria-expanded="${expanded}" aria-controls="details-${project.id}" aria-label="${escape(project.title)}: ${escape(project.subtitle)}">
          <span class="song-thumbnail-frame"><img class="song-thumbnail" src="${escape(project.image)}" alt=""></span>
          <span class="song-copy"><span class="song-category">${project.category === 'hardware' ? 'EMBEDDED SYSTEMS' : project.id === 'f1' ? 'DATA VISUALIZATION' : project.id === 'atnathanosu' ? 'GAME DEVELOPMENT' : 'SOFTWARE & SIMULATION'}</span><strong class="song-title">${escape(project.title)}</strong><span class="song-subtitle">${escape(project.subtitle)}</span><span class="song-stack">${escape(project.stack.slice(0, 4).join(' · '))}</span></span>
          <span class="song-status" aria-hidden="true">${selected ? '●' : ''}</span>
        </button>
        <div class="song-details" id="details-${project.id}" ${expanded ? '' : 'inert'}><div class="song-details-inner"><p>${escape(project.description)}</p><ul>${project.highlights.slice(0, 2).map(item => `<li>${escape(item)}</li>`).join('')}</ul><div class="song-actions"><button class="case-study-button" data-case-study="${project.id}">Read case study</button>${project.repo ? `<a class="source-link" href="${escape(project.repo)}" target="_blank" rel="noreferrer">Source code</a>` : `<span class="source-note">${project.category === 'hardware' ? 'Physical prototype' : 'Personal project'}</span>`}</div></div></div>
      </article>`;
    }).join('') : '<div class="empty-state"><span>Nothing in this collection yet.</span><p>Try a different search or show all projects.</p><button id="clear-filters">Clear filters</button></div>';
    updatePreview(selectedProject());
    $('#launch-project').setAttribute('aria-label', `Open ${selectedProject().title} case study`);
    $('#launch-project').disabled = !list.length;
    $('#show-case-study').disabled = !list.length;
    $('#random-project').disabled = !list.length;
    $('.library-count').innerHTML = `<strong>${String(list.length).padStart(2, '0')}</strong> ${list.length === 1 ? 'project' : 'projects'} in the collection`;
    updateBackdrop();
    queuePointerMotion();
  }

  function selectProject(id, { toggle = false, focus = false } = {}) {
    stopProjectPageScroll();
    const same = state.selected === id;
    state.selected = id;
    state.expanded = same && toggle ? !state.expanded : true;
    for (const entry of $$('.song-entry')) {
      const selected = entry.dataset.project === id;
      const expanded = selected && state.expanded;
      entry.classList.toggle('selected', selected);
      entry.classList.toggle('expanded', expanded);
      entry.querySelector('.song-card').setAttribute('aria-expanded', String(expanded));
      entry.querySelector('.song-details').inert = !expanded;
      entry.querySelector('.song-status').textContent = selected ? '●' : '';
    }
    updatePreview(selectedProject());
    $('#launch-project').setAttribute('aria-label', `Open ${selectedProject().title} case study`);
    updateBackdrop();
    queuePointerMotion();
    if (focus) {
      const card = $(`[data-project="${id}"] .song-card`);
      card?.focus({ preventScroll: true });
      card?.scrollIntoView({ block: 'nearest', behavior: state.motion ? 'smooth' : 'auto' });
    }
  }

  function resetFilters() {
    state.filter = 'all'; state.query = ''; $('#project-search').value = '';
    $$('[data-filter]').forEach(button => { button.classList.toggle('active', button.dataset.filter === 'all'); button.setAttribute('aria-pressed', String(button.dataset.filter === 'all')); });
    renderProjects();
  }

  function openCaseStudy(id = state.selected) {
    const project = projects.find(item => item.id === id);
    if (!project) return;
    resetProjectScroll();
    const dialog = $('#case-study-dialog');
    const contactLink = `<a class="solid-link" href="mailto:n76chan@uwaterloo.ca?subject=${encodeURIComponent(project.title + ' project')}">Ask about this project</a>`;
    $('#case-study-content').innerHTML = `<header class="case-study-header"><span class="eyebrow">${project.category === 'hardware' ? 'EMBEDDED SYSTEMS' : 'PROJECT CASE STUDY'}</span><h2 id="case-study-title">${escape(project.title)}</h2><p class="case-study-subtitle">${escape(project.stack.join(' / '))}</p></header><div class="case-study-body"><div class="case-study-copy"><section class="case-study-section"><h3>The project</h3><p>${escape(project.summary)}</p></section><section class="case-study-section"><h3>My contribution</h3><p>${escape(project.contribution)}</p></section><section class="case-study-section"><h3>Under the hood</h3><p>${escape(project.engineering)}</p></section><section class="case-study-section"><h3>What it does</h3><ul>${project.highlights.map(item => `<li>${escape(item)}</li>`).join('')}</ul></section>${project.collaboration ? `<p class="collaboration-note">${escape(project.collaboration)}</p>` : ''}<div class="case-study-actions">${project.repo ? `<a class="solid-link" href="${escape(project.repo)}" target="_blank" rel="noreferrer">View source code</a>` : contactLink}</div></div><div class="case-study-gallery">${project.images.map(image => `<figure><button class="image-button" data-image="${escape(image.src)}" data-image-alt="${escape(image.alt)}" data-image-caption="${escape(image.caption)}" aria-label="Enlarge ${escape(image.caption)}"><img src="${escape(image.src)}" alt="${escape(image.alt)}"></button><figcaption>${escape(image.caption)}</figcaption></figure>`).join('')}</div></div>`;
    previouslyFocused = document.activeElement;
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
    queuePointerMotion();
  }

  function openImage(button) {
    resetProjectScroll();
    $('#lightbox-image').src = button.dataset.image;
    $('#lightbox-image').alt = button.dataset.imageAlt || '';
    $('#lightbox-caption').textContent = button.dataset.imageCaption || '';
    $('#lightbox').showModal();
    queuePointerMotion();
  }

  function randomProject() {
    const list = visibleProjects();
    const candidates = list.filter(project => project.id !== state.selected);
    const pool = candidates.length ? candidates : list;
    if (!pool.length) return;
    selectProject(pool[Math.floor(Math.random() * pool.length)].id, { focus: true });
  }

  $('#main-cookie').addEventListener('click', activateCookie);
  $('#back-button').addEventListener('click', () => navigate('home'));
  $('#motion-toggle').addEventListener('click', () => setMotion(!state.motion));
  $('#random-project').addEventListener('click', randomProject);
  $('#show-case-study').addEventListener('click', () => openCaseStudy());
  $('#launch-project').addEventListener('click', () => openCaseStudy());
  $('#project-search').addEventListener('input', event => { state.query = event.target.value; renderProjects(); });
  $('#project-sort').addEventListener('change', event => { state.sort = event.target.value; renderProjects(); });
  document.addEventListener('wheel', event => {
    if (state.screen !== 'projects' || event.ctrlKey || event.defaultPrevented || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
    const delta = event.deltaY * unit;
    if (!smoothProjectWheel(event, delta)) stretchProjectScroll(event, delta);
  }, { passive: false });
  $('#projects-screen').addEventListener('touchstart', event => {
    resetProjectScroll();
    projectScroll.touchY = event.touches.length === 1 ? event.touches[0].clientY : null;
  }, { passive: true });
  $('#projects-screen').addEventListener('touchmove', event => {
    if (event.touches.length !== 1 || projectScroll.touchY === null) { releaseProjectScroll(); return; }
    const y = event.touches[0].clientY;
    const delta = projectScroll.touchY - y;
    projectScroll.touchY = y;
    stretchProjectScroll(event, delta);
  }, { passive: false });
  for (const type of ['touchend', 'touchcancel']) $('#projects-screen').addEventListener(type, releaseProjectScroll, { passive: true });
  document.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch' || !state.motion || !pointerQuery.matches) return;
    pointerPosition = { x: event.clientX, y: event.clientY };
    queuePointerMotion();
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => { pointerPosition = null; queuePointerMotion(); });
  document.addEventListener('pointerdown', stopProjectPageScroll, { passive: true });
  window.addEventListener('blur', () => { pointerPosition = null; resetProjectScroll(); queuePointerMotion(); });
  window.addEventListener('scroll', queuePointerMotion, { passive: true });
  window.addEventListener('resize', () => { stopProjectPageScroll(); queuePointerMotion(); }, { passive: true });
  pointerQuery.addEventListener?.('change', () => { pointerPosition = null; queuePointerMotion(); });
  if (typeof ResizeObserver === 'function') new ResizeObserver(queuePointerMotion).observe($('#song-list'));
  document.addEventListener('click', event => {
    const target = event.target.closest('button,a');
    if (!target) return;
    if (target.dataset.go) navigate(target.dataset.go);
    if (target.hasAttribute('data-filter')) {
      state.filter = target.dataset.filter;
      $$('[data-filter]').forEach(button => { const active = button === target; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
      renderProjects();
    }
    if (target.classList.contains('song-card')) selectProject(target.closest('[data-project]').dataset.project, { toggle: true, focus: true });
    if (target.hasAttribute('data-case-study')) openCaseStudy(target.dataset.caseStudy || state.selected);
    if (target.hasAttribute('data-image')) openImage(target);
    if (target.dataset.close) $(`#${target.dataset.close}`).close();
    if (target.id === 'clear-filters') resetFilters();
  });
  for (const dialog of $$('dialog')) {
    dialog.addEventListener('close', queuePointerMotion);
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
    });
  }
  $('#case-study-dialog').addEventListener('close', () => { if (previouslyFocused?.isConnected) previouslyFocused.focus({ preventScroll: true }); });

  document.addEventListener('keydown', event => {
    stopProjectPageScroll();
    if (event.ctrlKey || event.metaKey || event.altKey || $$('dialog[open]').length) return;
    const typing = event.target.closest('input,textarea,select,[contenteditable="true"]');
    if (event.key === 'Escape') {
      if (state.screen === 'projects' && state.query) { resetFilters(); $('#project-search').focus(); }
      else if (state.screen !== 'home') navigate('home');
      else if (state.menuOpen) { toggleMenu(false); $('#main-cookie').focus(); }
      event.preventDefault(); return;
    }
    if (typing) return;
    if (state.screen === 'home') {
      if (event.key.toLowerCase() === 'p') { event.preventDefault(); navigate('projects'); }
      if (event.key.toLowerCase() === 'a') { event.preventDefault(); navigate('about'); }
      if (event.key === 'Enter' && !event.target.closest('button,a')) { event.preventDefault(); if (!event.repeat) activateCookie(); }
      if (event.key === 'Enter' && event.repeat && event.target.closest('#main-cookie')) event.preventDefault();
    } else if (state.screen === 'projects') {
      if (event.key === '/') { event.preventDefault(); $('#project-search').focus(); }
      if (event.key === 'F2') { event.preventDefault(); randomProject(); }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        const list = visibleProjects();
        if (!list.length) return;
        const index = list.findIndex(project => project.id === state.selected);
        const delta = event.key === 'ArrowDown' ? 1 : -1;
        event.preventDefault(); selectProject(list[(index + delta + list.length) % list.length].id, { focus: true });
      }
      if (event.key === 'Enter' && (!event.target.closest('button,a') || event.target.closest('.song-card'))) { event.preventDefault(); openCaseStudy(); }
    }
  });

  function onHistoryChange() {
    const screen = location.hash.slice(1);
    if (['home', 'projects', 'about'].includes(screen) && screen !== state.screen) navigate(screen, { push: false });
    if (!screen && state.screen !== 'home') navigate('home', { push: false });
  }
  window.addEventListener('popstate', onHistoryChange);
  window.addEventListener('hashchange', onHistoryChange);
  function buildDecorations() {
    let lines = '';
    for (let i = 0; i < 120; i++) {
      const angle = i * 3;
      const length = 9 + (Math.sin(i * 2.37) + 1) * 21 + (i % 7 === 0 ? 12 : 0);
      lines += `<line x1="300" y1="79" x2="300" y2="${79 - length}" transform="rotate(${angle} 300 300)" style="--bar-delay:${-(i % 17) * 0.071}s;--bar-opacity:${0.1 + (i % 5) * 0.07}"/>`;
    }
    $('#cookie-spectrum').innerHTML = `<svg viewBox="0 0 600 600" aria-hidden="true">${lines}</svg>`;
    $('#floating-shapes').innerHTML = Array.from({ length: 14 }, (_, i) => `<span style="--shape-x:${(i * 29 + 7) % 100}%;--shape-y:${(i * 37 + 11) % 100}%;--shape-size:${14 + (i % 5) * 8}px;--shape-duration:${18 + i % 9}s;--shape-delay:-${i * 2.1}s"></span>`).join('');
  }
  function updateClock() { $('#footer-clock').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }); }
  buildDecorations();
  $('[data-filter="all"] span').textContent = String(projects.length);
  setMotion(state.motion, false);
  updateClock(); setInterval(updateClock, 15000);
  const initialScreen = ['home', 'projects', 'about'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'home';
  applyScreen(initialScreen, false);
  const connection = navigator.connection;
  if (!connection?.saveData && !/^(slow-)?2g$/.test(connection?.effectiveType || '')) {
    const warmWhenIdle = () => {
      if ('requestIdleCallback' in window) window.requestIdleCallback(preloadProjectImages, { timeout: 2000 });
      else setTimeout(preloadProjectImages, 1500);
    };
    if (document.readyState === 'complete') warmWhenIdle();
    else window.addEventListener('load', warmWhenIdle, { once: true });
  }
  requestAnimationFrame(() => document.body.classList.add('is-ready'));
})();
