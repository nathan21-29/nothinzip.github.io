# Live osu! stats setup

The portfolio stays on GitHub Pages. This Worker fetches public osu!standard stats for user **18855821** using osu! API v2. No visitor login is involved.

## 1. Register an osu! application

Visit <https://osu.ppy.sh/home/account/edit#oauth>, register an OAuth application named `Nathan Portfolio`, and leave the callback URL blank. This uses the client credentials grant with only the `public` scope.

The resulting Client ID and Client Secret are used only by the Worker. Do not put them in site JavaScript, commit them, or send them in chat.

## 2. Create the Worker

In <https://dash.cloudflare.com/>, open **Workers & Pages**, create a basic JavaScript Worker using the starter/Hello World option, name it `nathan-osu-stats`, and deploy it.

Open the Worker's code editor, replace its starter code with the entire contents of [worker.mjs](worker.mjs), and deploy the change. It is fine if the dashboard calls its JavaScript file `worker.js`.

Alternatively, with Node.js installed, open a terminal at the repository root and run:

```powershell
npx wrangler login
npx wrangler deploy --config workers/osu-stats/wrangler.jsonc
```

This deploys only the Worker; it does not move the portfolio from GitHub Pages.

## 3. Add the secrets

Select the Worker, then **Settings > Variables and Secrets > Add**. Add each value with type **Secret**:

| Name | Value |
| --- | --- |
| `OSU_CLIENT_ID` | The Client ID from osu! |
| `OSU_CLIENT_SECRET` | The Client Secret from osu! |

Save/deploy the settings. The CLI equivalent prompts for each value without placing it in a command:

```powershell
npx wrangler secret put OSU_CLIENT_ID --config workers/osu-stats/wrangler.jsonc
npx wrangler secret put OSU_CLIENT_SECRET --config workers/osu-stats/wrangler.jsonc
```

## 4. Test the public endpoint

Open your Worker's production `https://nathan-osu-stats.YOUR-SUBDOMAIN.workers.dev/stats` URL. Replace `YOUR-SUBDOMAIN` with the actual address shown by Cloudflare.

You should see JSON containing `userId`, `mode`, `level`, `progress`, `pp`, and `updatedAt`. No credentials should appear. A 503 with a generic error means the settings, credentials, or osu! connection need checking. Failures are cached for 60 seconds, so allow a minute after fixing settings before retrying.

Use the deployed URL to test caching; dashboard previews do not use the production cache.

## 5. Connect the website

In the root `index.html`, find `id="osu-stats-script"` and set its `data-endpoint` to the public Worker `/stats` URL. This checkout is configured for `https://nathan-osu-stats.oofey123.workers.dev/stats`. The public URL is safe to share.

```html
<script id="osu-stats-script" src="osu-stats.js" data-endpoint="https://nathan-osu-stats.YOUR-SUBDOMAIN.workers.dev/stats" defer></script>
```

Push the site changes to GitHub Pages. Each page load makes one request in the background. The profile header shows your osu! level and pp, and its bar shows your progress to the next level. No request is sent while the endpoint is empty.

Successful stats are cached for five minutes at each Cloudflare location; this is an edge cache, not one global five-minute limit. Overlapping requests within one Worker instance share the same refresh. Tokens are reused within an instance until shortly before expiry. Query strings do not bypass the stats cache, and failures are cached for one minute to reduce retries.

The browser keeps the last successful result and displays it while fetching, or if the Worker fails. Hover over the stats to see their fetch time. If no result has ever been saved and the request fails, the optional stats row stays hidden. This storage belongs to each visitor's browser and may be unavailable in private browsing.

The endpoint intentionally serves these public stats across origins; it accepts no user IDs or arbitrary upstream URLs and never returns credentials.

## Checks

At the repository root:

```powershell
npm run check
```

Tests mock osu! and Cloudflare to check cache reuse, simultaneous visits, missing secrets, upstream errors, browser fallback, and blocked storage. A production request is still required to verify real credentials and deployment.

References: <https://osu.ppy.sh/docs/index.html>, <https://developers.cloudflare.com/workers/configuration/secrets/>, <https://developers.cloudflare.com/workers/runtime-apis/cache/>.
