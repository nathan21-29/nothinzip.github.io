const USER_ID = 18855821;
const CACHE_SECONDS = 300;
let token;
let tokenExpiresAt = 0;
let pendingToken;
let pendingStats;

function json(body, status = 200, seconds = CACHE_SECONDS) {
  return Response.json(body, {
    status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': `public, max-age=${seconds}`,
      'X-Content-Type-Options': 'nosniff',
      ...(status === 503 ? { 'Retry-After': String(seconds) } : {})
    }
  });
}

async function accessToken(env) {
  if (token && Date.now() < tokenExpiresAt) return token;
  if (!pendingToken) {
    pendingToken = (async () => {
      if (!env.OSU_CLIENT_ID || !env.OSU_CLIENT_SECRET) throw new Error('Missing configuration');
      const response = await fetch('https://osu.ppy.sh/oauth/token', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: env.OSU_CLIENT_ID,
          client_secret: env.OSU_CLIENT_SECRET,
          grant_type: 'client_credentials',
          scope: 'public'
        }),
        signal: AbortSignal.timeout(5000)
      });
      if (!response.ok) throw new Error('Authentication unavailable');
      const auth = await response.json();
      if (typeof auth.access_token !== 'string' || !auth.access_token ||
          !Number.isFinite(auth.expires_in) || auth.expires_in <= 0) throw new Error('Invalid token');
      token = auth.access_token;
      tokenExpiresAt = Date.now() + Math.max(0, auth.expires_in - 60) * 1000;
      return token;
    })().finally(() => { pendingToken = undefined; });
  }
  return pendingToken;
}

async function loadStats(env) {
  const bearer = await accessToken(env);
  const response = await fetch(`https://osu.ppy.sh/api/v2/users/${USER_ID}/osu`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${bearer}` },
    signal: AbortSignal.timeout(5000)
  });
  if (response.status === 401) { token = undefined; tokenExpiresAt = 0; }
  if (!response.ok) throw new Error('Profile unavailable');
  const user = await response.json();
  const stats = user.statistics;
  if (user.id !== USER_ID || !stats ||
      !Number.isFinite(stats.pp) || stats.pp < 0 ||
      !Number.isInteger(stats.level?.current) || stats.level.current < 0 ||
      !Number.isFinite(stats.level.progress) || stats.level.progress < 0 || stats.level.progress > 100) {
    throw new Error('Invalid statistics');
  }
  return {
    userId: USER_ID,
    mode: 'osu',
    level: stats.level.current,
    progress: stats.level.progress,
    pp: stats.pp,
    updatedAt: new Date().toISOString()
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/' && url.pathname !== '/stats') return json({ error: 'Not found' }, 404, 0);
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' }
      });
    }
    if (request.method !== 'GET') {
      const response = json({ error: 'Method not allowed' }, 405, 0);
      response.headers.set('Allow', 'GET, OPTIONS');
      return response;
    }
    // A fixed key prevents query strings from bypassing the stats cache.
    const key = new Request(new URL('/stats', url.origin));
    const cache = caches.default;
    const cached = await cache.match(key);
    if (cached) return cached;
    // Merge overlapping requests within this Worker instance.
    if (!pendingStats) {
      pendingStats = (async () => {
        let response;
        try { response = json(await loadStats(env)); }
        catch { response = json({ error: 'osu! stats are temporarily unavailable' }, 503, 60); }
        try { await cache.put(key, response.clone()); }
        catch { /* A cache failure should not discard a valid API result. */ }
        return response;
      })().finally(() => { pendingStats = undefined; });
    }
    return (await pendingStats).clone();
  }
};
