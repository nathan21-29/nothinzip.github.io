/* Decide before the first paint; a missing/failed intro must never hide the site. */
(() => {
  'use strict';
  const root = document.documentElement;
  const key = 'nathan-intro-seen';
  const development = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) || location.protocol === 'file:';
  const params = new URLSearchParams(location.search);
  let seen = false;
  let motionOff = false;
  try { seen = sessionStorage.getItem(key) === '1'; } catch { /* Storage is optional. */ }
  try { motionOff = localStorage.getItem('nathan-motion') === 'off'; } catch { /* Storage is optional. */ }
  const deepLink = location.hash && !['#home', '#'].includes(location.hash);
  const replay = development && params.get('intro') === 'replay';
  const active = !deepLink && (replay || !seen) && !(development && params.get('intro') === 'off');
  const cleanups = [];
  let watchdog;
  const intro = window.SiteIntro = {
    active,
    busy: active,
    effectsActive: false,
    reduced: motionOff,
    benchmark: replay && params.get('introPerf') === '1' && !params.has('introAt'),
    // A local-only still frame is useful for reviewing timing at narrow sizes.
    reviewTime: replay && params.has('introAt') ? Math.max(0, Math.min(8122, Number(params.get('introAt')) || 0)) : null,
    onFinish(cleanup) { cleanups.push(cleanup); },
    skip() {
      if (!intro.active) return;
      if (intro.animateSkip) intro.animateSkip();
      else intro.finish();
    },
    settle() {
      if (!intro.busy) return;
      intro.busy = false;
      document.dispatchEvent(new Event('site:intro-idle'));
    },
    finish() {
      if (!intro.active) return;
      intro.active = false;
      clearTimeout(watchdog);
      for (const cleanup of cleanups.splice(0)) {
        try { cleanup(); } catch { /* Always continue restoring the interface. */ }
      }
      root.removeAttribute('data-intro');
      try { sessionStorage.setItem(key, '1'); } catch { /* Private/file browsing still works. */ }
      document.dispatchEvent(new Event('site:intro-end'));
      if (!intro.effectsActive) intro.settle();
    }
  };
  if (!active) return;
  root.dataset.intro = intro.reduced ? 'fade' : 'pending';
  // Also finish when the tab leaves, so history restoration cannot revive a frozen intro.
  window.addEventListener('pagehide', intro.finish, { once: true });
  // Register before the deferred app: no click/Enter used to skip may reach navigation.
  let suppressEnter = false;
  window.addEventListener('keydown', event => {
    if (suppressEnter && event.key === 'Enter') {
      event.preventDefault(); event.stopImmediatePropagation(); return;
    }
    if (!intro.active || event.ctrlKey || event.altKey || event.metaKey) return;
    if (event.key === 'Enter') {
      suppressEnter = true;
      event.preventDefault(); event.stopImmediatePropagation(); intro.skip();
    } else if (['Tab', 'Escape', ' '].includes(event.key)) {
      event.preventDefault(); event.stopImmediatePropagation(); intro.skip();
    } else {
      event.preventDefault(); event.stopImmediatePropagation();
    }
  }, true);
  window.addEventListener('keyup', event => {
    if (suppressEnter && event.key === 'Enter') {
      event.preventDefault(); event.stopImmediatePropagation(); suppressEnter = false;
    }
  }, true);
  window.addEventListener('click', event => {
    if (!intro.active) return;
    event.preventDefault(); event.stopImmediatePropagation(); intro.skip();
  }, true);
  document.addEventListener('visibilitychange', () => { if (document.hidden) intro.finish(); });
  // No load event or asset promise gates playback. This is a recovery deadline only.
  watchdog = setTimeout(intro.finish, 9000);
})();
