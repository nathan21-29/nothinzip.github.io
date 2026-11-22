/* Local, dependency-free portfolio. No accounts, trackers, or remote requests. */
(() => {
  'use strict';
  const projects = window.PORTFOLIO_PROJECTS || [];
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  const readPreference = name => { try { return localStorage.getItem(name); } catch { return null; } };
  const savePreference = (name, value) => { try { localStorage.setItem(name, value); } catch { /* Private/file browsing still works. */ } };
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const preference = readPreference('nathan-motion');
  const state = {
    screen: 'home', menuOpen: false, selected: projects[0]?.id,
    filter: 'all', query: '', sort: 'featured', expanded: true,
    motion: preference === null ? !motionQuery.matches : preference === 'on',
    audio: false
  };
  let navigationId = 0;
  let toastTimer;
  let previouslyFocused;

  function selectedProject() { return projects.find(project => project.id === state.selected) || projects[0]; }
  function visibleProjects() {
    const terms = state.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const list = projects.filter(project => {
      const haystack = [project.title, project.subtitle, project.summary, project.category, ...project.stack].join(' ').toLowerCase();
      return (state.filter === 'all' || state.filter === project.category) && terms.every(term => haystack.includes(term));
    });
    return state.sort === 'title' ? list.sort((a, b) => a.title.localeCompare(b.title)) : list;
  }

  function notify(message) {
    clearTimeout(toastTimer);
    $('#toast').textContent = message;
    $('#toast').classList.add('visible');
    toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 2400);
  }

  function setMotion(enabled, persist = true) {
    state.motion = enabled;
    document.body.classList.toggle('reduced-motion', !enabled);
    document.body.classList.toggle('motion-enabled', enabled);
    $('#motion-toggle').setAttribute('aria-pressed', String(enabled));
    $('#motion-toggle').setAttribute('aria-label', enabled ? 'Reduce motion' : 'Enable motion');
    $('#motion-toggle span').textContent = enabled ? 'Motion on' : 'Motion reduced';
    if (persist) savePreference('nathan-motion', enabled ? 'on' : 'off');
  }

  function toggleMenu(force) {
    state.menuOpen = typeof force === 'boolean' ? force : !state.menuOpen;
    $('#home-stage').classList.toggle('is-open', state.menuOpen);
    $('#main-menu').inert = !state.menuOpen || state.screen !== 'home';
    $('#main-cookie').setAttribute('aria-expanded', String(state.menuOpen));
    $('#main-cookie').setAttribute('aria-label', state.menuOpen ? 'Close main menu' : 'Open main menu');
    $('#cookie-caption').textContent = state.menuOpen ? 'PICK YOUR NEXT STOP' : 'CLICK TO EXPLORE';
    $('#home-tip').innerHTML = state.menuOpen
      ? '<span class="tip-dot"></span>A project, or the person behind it. Your call.<span class="tip-key"><kbd>Esc</kbd> to close</span>'
      : '<span class="tip-dot"></span>Click the circle. There\'s more on the other side.<span class="tip-key"><kbd>Enter</kbd> works, too</span>';
    if (state.audio) ambience.click(state.menuOpen ? 660 : 440);
  }

  function updateBackdrop() {
    const project = selectedProject();
    $('#world-image').style.backgroundImage = state.screen === 'projects' && project ? `url("${project.image}")` : 'none';
    document.body.style.setProperty('--selected-accent', project?.accent || '#ed70a8');
  }

  function applyScreen(screen, focus = true) {
    state.screen = screen;
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
    const id = ++navigationId;
    if (push && location.hash !== `#${screen}`) {
      try { history.pushState({ screen }, '', `#${screen}`); } catch { /* Works directly from a local file too. */ }
    }
    if (screen === state.screen) { $('#transition-wipe').classList.remove('is-active'); return; }
    if (screen === 'home') state.menuOpen = true;
    if (state.audio) ambience.click(780);
    const wipe = $('#transition-wipe');
    if (!state.motion) { applyScreen(screen); return; }
    wipe.classList.add('is-active');
    setTimeout(() => {
      if (id !== navigationId) return;
      applyScreen(screen);
      setTimeout(() => { if (id === navigationId) wipe.classList.remove('is-active'); }, 80);
    }, 170);
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
    $('#launch-project').setAttribute('aria-label', `Open ${project.title} case study`);
  }

  function renderProjects() {
    const list = visibleProjects();
    if (list.length && !list.some(project => project.id === state.selected)) { state.selected = list[0].id; state.expanded = true; }
    $('#song-list').innerHTML = list.length ? list.map((project, index) => {
      const selected = state.selected === project.id;
      const expanded = selected && state.expanded;
      return `<article class="song-entry ${selected ? 'selected' : ''} ${expanded ? 'expanded' : ''}" data-project="${project.id}" style="--card-index:${index};--project-accent:${project.accent}">
        <button class="song-card" aria-expanded="${expanded}" aria-controls="details-${project.id}" aria-label="${escape(project.title)}: ${escape(project.subtitle)}">
          <img class="song-thumbnail" src="${escape(project.image)}" alt="">
          <span class="song-copy"><span class="song-category">${project.category === 'hardware' ? 'EMBEDDED SYSTEMS' : project.id === 'f1' ? 'DATA VISUALIZATION' : project.id === 'atnathanosu' ? 'GAME DEVELOPMENT' : 'SOFTWARE & SIMULATION'}</span><strong class="song-title">${escape(project.title)}</strong><span class="song-subtitle">${escape(project.subtitle)}</span><span class="song-stack">${escape(project.stack.slice(0, 4).join(' · '))}</span></span>
          <span class="song-status" aria-hidden="true">${selected ? '●' : ''}</span>
        </button>
        <div class="song-details" id="details-${project.id}" ${expanded ? '' : 'inert'}><div class="song-details-inner"><p>${escape(project.description)}</p><ul>${project.highlights.slice(0, 2).map(item => `<li>${escape(item)}</li>`).join('')}</ul><div class="song-actions"><button class="case-study-button" data-case-study="${project.id}">Read case study</button>${project.repo ? `<a class="source-link" href="${escape(project.repo)}" target="_blank" rel="noreferrer">Source code</a>` : `<span class="source-note">${project.category === 'hardware' ? 'Physical prototype' : 'Personal project'}</span>`}</div></div></div>
      </article>`;
    }).join('') : '<div class="empty-state"><span>Nothing in this collection yet.</span><p>Try a different search or show all projects.</p><button id="clear-filters">Clear filters</button></div>';
    renderPreview(selectedProject());
    $('#launch-project').disabled = !list.length;
    $('#show-case-study').disabled = !list.length;
    $('#random-project').disabled = !list.length;
    $('.library-count').innerHTML = `<strong>${String(list.length).padStart(2, '0')}</strong> ${list.length === 1 ? 'project' : 'projects'} in the collection`;
    updateBackdrop();
  }

  function selectProject(id, { toggle = false, focus = false } = {}) {
    const same = state.selected === id;
    state.selected = id;
    state.expanded = same && toggle ? !state.expanded : true;
    renderProjects();
    if (focus) {
      const card = $(`[data-project="${id}"] .song-card`);
      card?.focus({ preventScroll: true });
      card?.scrollIntoView({ block: 'nearest', behavior: state.motion ? 'smooth' : 'auto' });
    }
    if (state.audio) ambience.click(520 + projects.findIndex(project => project.id === id) * 100);
  }

  function resetFilters() {
    state.filter = 'all'; state.query = ''; $('#project-search').value = '';
    $$('[data-filter]').forEach(button => { button.classList.toggle('active', button.dataset.filter === 'all'); button.setAttribute('aria-pressed', String(button.dataset.filter === 'all')); });
    renderProjects();
  }

  function openCaseStudy(id = state.selected) {
    const project = projects.find(item => item.id === id);
    if (!project) return;
    const dialog = $('#case-study-dialog');
    const contactLink = `<a class="solid-link" href="mailto:n76chan@uwaterloo.ca?subject=${encodeURIComponent(project.title + ' project')}">Ask about this project</a>`;
    $('#case-study-content').innerHTML = `<header class="case-study-header"><span class="eyebrow">${project.category === 'hardware' ? 'EMBEDDED SYSTEMS' : 'PROJECT CASE STUDY'}</span><h2 id="case-study-title">${escape(project.title)}</h2><p class="case-study-subtitle">${escape(project.stack.join(' / '))}</p></header><div class="case-study-body"><div class="case-study-copy"><section class="case-study-section"><h3>The project</h3><p>${escape(project.summary)}</p></section><section class="case-study-section"><h3>My contribution</h3><p>${escape(project.contribution)}</p></section><section class="case-study-section"><h3>Under the hood</h3><p>${escape(project.engineering)}</p></section><section class="case-study-section"><h3>What it does</h3><ul>${project.highlights.map(item => `<li>${escape(item)}</li>`).join('')}</ul></section>${project.collaboration ? `<p class="collaboration-note">${escape(project.collaboration)}</p>` : ''}<div class="case-study-actions">${project.repo ? `<a class="solid-link" href="${escape(project.repo)}" target="_blank" rel="noreferrer">View source code</a>` : contactLink}</div></div><div class="case-study-gallery">${project.images.map(image => `<figure><button class="image-button" data-image="${escape(image.src)}" data-image-alt="${escape(image.alt)}" data-image-caption="${escape(image.caption)}" aria-label="Enlarge ${escape(image.caption)}"><img src="${escape(image.src)}" alt="${escape(image.alt)}"></button><figcaption>${escape(image.caption)}</figcaption></figure>`).join('')}</div></div>`;
    previouslyFocused = document.activeElement;
    if (!dialog.open) dialog.showModal();
  }

  function openImage(button) {
    $('#lightbox-image').src = button.dataset.image;
    $('#lightbox-image').alt = button.dataset.imageAlt || '';
    $('#lightbox-caption').textContent = button.dataset.imageCaption || '';
    $('#lightbox').showModal();
  }

  function randomProject() {
    const list = visibleProjects();
    const candidates = list.filter(project => project.id !== state.selected);
    const pool = candidates.length ? candidates : list;
    if (!pool.length) return;
    selectProject(pool[Math.floor(Math.random() * pool.length)].id, { focus: true });
  }

  /* A small original generative ambience, activated only by a user click. */
  const ambience = {
    context: null, master: null, timer: null, nextNote: 0, step: 0,
    async start() {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) throw new Error('Audio is unavailable in this browser.');
      if (!this.context) {
        this.context = new Audio();
        this.master = this.context.createGain();
        this.master.gain.value = 0.11;
        this.master.connect(this.context.destination);
      }
      await this.context.resume();
      this.nextNote = this.context.currentTime + 0.08;
      this.step = 0;
      clearInterval(this.timer);
      this.timer = setInterval(() => this.schedule(), 60);
      this.schedule();
    },
    schedule() {
      const context = this.context;
      if (!context || !state.audio || document.hidden) return;
      if (this.nextNote < context.currentTime) this.nextNote = context.currentTime + 0.02;
      const chords = [[48, 52, 55], [45, 48, 52], [41, 45, 48], [43, 47, 50]];
      while (this.nextNote < context.currentTime + 0.18) {
        const chord = chords[Math.floor(this.step / 16) % chords.length];
        if (this.step % 4 === 0) chord.forEach(note => this.tone(note, this.nextNote, 1.8, 0.06, 'sine'));
        const sequence = [0, 2, 1, 2, 1, 0, 2, 1];
        this.tone(chord[sequence[this.step % 8]] + 24, this.nextNote, 0.34, 0.09, 'sine');
        if (this.step % 2 === 0) this.tone(31, this.nextNote, 0.1, 0.17, 'sine');
        this.nextNote += 0.25;
        this.step += 1;
      }
    },
    tone(note, at, duration, volume, waveform) {
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = waveform;
      oscillator.frequency.value = 440 * 2 ** ((note - 69) / 12);
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(volume, at + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
      oscillator.connect(gain); gain.connect(this.master);
      oscillator.start(at); oscillator.stop(at + duration + 0.02);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    },
    click(frequency) {
      if (!this.context || this.context.state !== 'running') return;
      const note = 69 + 12 * Math.log2(frequency / 440);
      this.tone(note, this.context.currentTime, 0.08, 0.12, 'sine');
    },
    async stop() {
      clearInterval(this.timer);
      this.timer = null;
      if (this.context) await this.context.suspend();
    }
  };

  $('#audio-toggle').addEventListener('click', async () => {
    state.audio = !state.audio;
    try {
      if (state.audio) await ambience.start(); else await ambience.stop();
      $('#audio-toggle').setAttribute('aria-pressed', String(state.audio));
      $('#audio-toggle').setAttribute('aria-label', state.audio ? 'Pause menu ambience' : 'Play original menu ambience');
      $('#audio-toggle').innerHTML = state.audio ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3v14H7ZM15 5h3v14h-3Z"/></svg>' : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 11 7-11 7Z"/></svg>';
      $('#track-state').textContent = state.audio ? 'NOW PLAYING · ORIGINAL AMBIENCE' : 'SOUNDTRACK OPTIONAL';
      $('#track-name').textContent = state.audio ? 'A little room to explore' : 'A little room to explore';
      document.body.classList.toggle('audio-playing', state.audio);
    } catch {
      state.audio = false;
      $('#audio-toggle').setAttribute('aria-pressed', 'false');
      notify('Audio couldn’t start. The rest of the portfolio works without it.');
    }
  });

  $('#main-cookie').addEventListener('click', () => toggleMenu());
  $('#back-button').addEventListener('click', () => navigate('home'));
  $('#motion-toggle').addEventListener('click', () => setMotion(!state.motion));
  $('#random-project').addEventListener('click', randomProject);
  $('#show-case-study').addEventListener('click', () => openCaseStudy());
  $('#launch-project').addEventListener('click', () => openCaseStudy());
  $('#project-search').addEventListener('input', event => { state.query = event.target.value; renderProjects(); });
  $('#project-sort').addEventListener('change', event => { state.sort = event.target.value; renderProjects(); });
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
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
    });
  }
  $('#case-study-dialog').addEventListener('close', () => { if (previouslyFocused?.isConnected) previouslyFocused.focus({ preventScroll: true }); });

  document.addEventListener('keydown', event => {
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
      if (event.key === 'Enter' && !event.target.closest('button,a')) { event.preventDefault(); toggleMenu(); }
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
  motionQuery.addEventListener?.('change', event => { if (readPreference('nathan-motion') === null) setMotion(!event.matches, false); });
  document.addEventListener('visibilitychange', () => {
    if (!state.audio || !ambience.context) return;
    if (document.hidden) ambience.context.suspend();
    else ambience.context.resume().then(() => { ambience.nextNote = ambience.context.currentTime + 0.03; });
  });

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
  requestAnimationFrame(() => document.body.classList.add('is-ready'));
})();
