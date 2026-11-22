/* Public osu! stats only. Credentials live in the Cloudflare Worker. */
(() => {
  'use strict';
  const endpoint = document.querySelector('#osu-stats-script')?.dataset.endpoint;
  const label = document.querySelector('#osu-stats');
  const progress = document.querySelector('.profile-progress i');
  const ppLabel = document.querySelector('#osu-pp');
  const levelLabel = document.querySelector('#osu-level');
  const avatar = document.querySelector('#osu-avatar');
  avatar?.addEventListener('error', () => { avatar.hidden = true; });
  const storageKey = 'nathan-osu-stats-v1';
  if (!endpoint || !label || !progress) return;

  function display(stats, saved = false) {
    if (stats?.userId !== 18855821 || stats.mode !== 'osu' ||
        !Number.isInteger(stats.level) || stats.level < 0 ||
        !Number.isFinite(stats.progress) || stats.progress < 0 || stats.progress > 100 ||
        !Number.isFinite(stats.pp) || stats.pp < 0 ||
        !Number.isFinite(Date.parse(stats.updatedAt))) return false;
    const pp = stats.pp.toLocaleString('en-CA', { maximumFractionDigits: 0 });
    label.textContent = `osu! · Level ${stats.level} · ${pp} pp`;
    label.title = `${saved ? 'Last saved stats' : 'Stats updated'}: ${new Date(stats.updatedAt).toLocaleString()}`;
    label.hidden = false;
    if (ppLabel) { ppLabel.textContent = `${pp}pp`; ppLabel.title = label.title; }
    if (levelLabel) { levelLabel.textContent = `Lv${stats.level}`; levelLabel.title = `${stats.progress}% to the next level`; }
    progress.style.width = `${stats.progress}%`;
    return true;
  }

  try { display(JSON.parse(localStorage.getItem(storageKey)), true); }
  catch { /* Storage may be unavailable; a live request can still work. */ }

  async function update() {
    try {
      const response = await fetch(endpoint, {
        credentials: 'omit',
        cache: 'no-store',
        signal: AbortSignal.timeout(15000)
      });
      if (!response.ok) return;
      const stats = await response.json();
      if (display(stats)) {
        try { localStorage.setItem(storageKey, JSON.stringify(stats)); }
        catch { /* A full or disabled store does not prevent displaying stats. */ }
      }
    } catch { /* Keep saved stats, or leave the optional row hidden. */ }
  }
  update();
})();
