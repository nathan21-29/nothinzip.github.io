import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { setImmediate } from 'node:timers/promises';

const env = { OSU_CLIENT_ID: 'test-client', OSU_CLIENT_SECRET: 'test-secret' };
const profile = { id: 18855821, statistics: { pp: 6789.45, level: { current: 101, progress: 42 } } };
let moduleNumber = 0;

async function workerFixture(t, reply = () => Response.json(profile)) {
  const entries = new Map();
  const previousCaches = globalThis.caches;
  globalThis.caches = { default: {
    async match(key) { return entries.get(key.url)?.clone(); },
    async put(key, response) { entries.set(key.url, response.clone()); }
  } };
  t.after(() => {
    if (previousCaches === undefined) delete globalThis.caches;
    else globalThis.caches = previousCaches;
  });
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url, options });
    if (url.endsWith('/oauth/token')) return Response.json({ access_token: 'test-token', expires_in: 86400 });
    return reply();
  });
  const url = new URL('../workers/osu-stats/worker.mjs', import.meta.url);
  url.searchParams.set('test', String(moduleNumber++));
  const { default: worker } = await import(url);
  return { worker, requests, entries };
}

test('Worker returns public stats and reuses the cache across URL variations', async t => {
  const { worker, requests } = await workerFixture(t);
  const response = await worker.fetch(new Request('https://stats.example/stats'), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
  assert.equal(response.headers.get('cache-control'), 'public, max-age=300');
  const stats = await response.json();
  assert.equal(stats.userId, 18855821);
  assert.equal(stats.mode, 'osu');
  assert.equal(stats.pp, 6789.45);
  assert.equal(stats.level, 101);
  assert.equal(stats.progress, 42);
  assert.ok(Number.isFinite(Date.parse(stats.updatedAt)));
  assert.equal(JSON.stringify(stats).includes('test-token'), false);
  assert.equal(JSON.stringify(stats).includes('test-secret'), false);
  await worker.fetch(new Request('https://stats.example/?anything=1'), env);
  assert.equal(requests.length, 2);
  const body = requests[0].options.body;
  assert.equal(body.get('scope'), 'public');
  assert.equal(body.get('client_secret'), env.OSU_CLIENT_SECRET);
  assert.equal(requests[1].url, 'https://osu.ppy.sh/api/v2/users/18855821/osu');
});

test('Expired stats cache triggers a new profile request while reusing the token', async t => {
  const { worker, requests, entries } = await workerFixture(t);
  await worker.fetch(new Request('https://stats.example/'), env);
  entries.clear();
  await worker.fetch(new Request('https://stats.example/'), env);
  assert.equal(requests.filter(r => r.url.endsWith('/oauth/token')).length, 1);
  assert.equal(requests.length, 3);
});

test('Concurrent visitors share one in-flight API request', async t => {
  const { worker, requests } = await workerFixture(t);
  const responses = await Promise.all(Array.from({ length: 8 }, () => worker.fetch(new Request('https://stats.example/'), env)));
  for (const response of responses) assert.equal((await response.json()).pp, 6789.45);
  assert.equal(requests.length, 2);
});

test('Upstream failures are generic and cached briefly to reduce repeated failures', async t => {
  const { worker, requests } = await workerFixture(t, () => new Response('private upstream diagnostic', { status: 429 }));
  const response = await worker.fetch(new Request('https://stats.example/'), env);
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('retry-after'), '60');
  assert.deepEqual(await response.json(), { error: 'osu! stats are temporarily unavailable' });
  await worker.fetch(new Request('https://stats.example/'), env);
  assert.equal(requests.length, 2);
});

test('Wrong profiles and malformed statistics are never displayed as valid stats', async t => {
  let upstream = { ...profile, id: 123 };
  const { worker, entries } = await workerFixture(t, () => Response.json(upstream));
  const response = await worker.fetch(new Request('https://stats.example/'), env);
  assert.equal(response.status, 503);
  entries.clear();
  upstream = { ...profile, statistics: { ...profile.statistics, level: { current: 101, progress: 150 } } };
  assert.equal((await worker.fetch(new Request('https://stats.example/'), env)).status, 503);
});

test('Missing secrets do not cause upstream requests or expose configuration', async t => {
  const { worker, requests } = await workerFixture(t);
  const response = await worker.fetch(new Request('https://stats.example/'), {});
  assert.equal(response.status, 503);
  assert.equal(requests.length, 0);
  assert.equal((await response.text()).includes('CLIENT_SECRET'), false);
});

test('Worker handles preflight and rejects unsupported routes and methods without API calls', async t => {
  const { worker, requests } = await workerFixture(t);
  assert.equal((await worker.fetch(new Request('https://stats.example/', { method: 'OPTIONS' }), env)).status, 204);
  assert.equal((await worker.fetch(new Request('https://stats.example/', { method: 'POST' }), env)).status, 405);
  assert.equal((await worker.fetch(new Request('https://stats.example/other'), env)).status, 404);
  assert.equal(requests.length, 0);
});

const clientSource = readFileSync(new URL('../osu-stats.js', import.meta.url), 'utf8');
const savedStats = { userId: 18855821, mode: 'osu', level: 101, progress: 42, pp: 6789.45, updatedAt: '2026-11-22T12:00:00Z' };
async function clientFixture({ endpoint = 'https://stats.example/', saved = null, fetchStats = async () => Response.json(savedStats), storageBlocked = false } = {}) {
  const label = { hidden: true, textContent: '', title: '' };
  const ppLabel = { textContent: '— pp', title: '' };
  const levelLabel = { textContent: 'Lv—', title: '' };
  const progress = { style: { width: '100%' } };
  const storage = new Map(saved ? [['nathan-osu-stats-v1', JSON.stringify(saved)]] : []);
  let requests = 0;
  const context = {
    document: { querySelector: selector => ({ '#osu-stats-script': { dataset: { endpoint } }, '#osu-stats': label, '.profile-progress i': progress, '#osu-pp': ppLabel, '#osu-level': levelLabel })[selector] },
    localStorage: {
      getItem: key => { if (storageBlocked) throw new Error('blocked'); return storage.get(key) ?? null; },
      setItem: (key, value) => { if (storageBlocked) throw new Error('blocked'); storage.set(key, value); }
    },
    fetch: async (...args) => { requests++; return fetchStats(...args); },
    AbortSignal
  };
  vm.runInNewContext(clientSource, context);
  await setImmediate();
  return { label, ppLabel, levelLabel, progress, storage, requests };
}

test('Site stays unchanged and makes no request until an endpoint is configured', async () => {
  const { label, requests } = await clientFixture({ endpoint: '' });
  assert.equal(requests, 0);
  assert.equal(label.hidden, true);
});

test('Site displays fresh stats and updates the level bar even if storage is blocked', async () => {
  const { label, ppLabel, levelLabel, progress, requests } = await clientFixture({ storageBlocked: true });
  assert.equal(requests, 1);
  assert.equal(label.hidden, false);
  assert.match(label.textContent, /Level 101.*6,789 pp/);
  assert.equal(ppLabel.textContent, '6,789pp');
  assert.equal(levelLabel.textContent, 'Lv101');
  assert.equal(progress.style.width, '42%');
});

test('Site retains last saved stats if the Worker is unavailable', async () => {
  const { label, progress } = await clientFixture({ saved: savedStats, fetchStats: async () => { throw new Error('offline'); } });
  assert.equal(label.hidden, false);
  assert.match(label.title, /Last saved stats/);
  assert.equal(progress.style.width, '42%');
});

test('Site ignores malformed data without replacing a saved good value', async () => {
  const { label, storage } = await clientFixture({ saved: savedStats, fetchStats: async () => Response.json({ ...savedStats, progress: 150 }) });
  assert.match(label.textContent, /Level 101/);
  assert.match(label.title, /Last saved stats/);
  assert.equal(JSON.parse(storage.get('nathan-osu-stats-v1')).progress, 42);
});
