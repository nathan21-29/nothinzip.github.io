# Nathan Chan - portfolio

A static portfolio inspired by osu!stable's interface. It needs no dependency installation. The portfolio works offline; optional live osu! stats use a separate Cloudflare Worker.

This entire `nathan-portfolio` folder is the repository root. Everything required to run the site is included inside it.

The portfolio presents four projects, led by **atNathanOsu**, a Java rhythm game with standard and four-key modes.

Desktop content fills more of the viewport while keeping an outer margin. Typography, cards, controls, and spacing scale together on larger screens; mobile retains its compact layout. Images keep their original layout proportions.

Project thumbnails follow the cards' parallelogram edges with equal left, top, and bottom insets. Wheel scrolling blends into a continuous damped movement, with card recoil at page bounds for mouse wheels and precision trackpads. The image viewer and case study share the same opening animation.

The home scene layers a uniform plum tint over the supplied photo at `assets/site-background.jpg`. Extra scrolling at either bound of Project Select retracts the cards slightly toward the right edge, then eases them back into place. Repeated wheel ticks blend into one continuous movement, with the cards returning after scrolling stops. The effect moves only the cards. Longer pages still scroll normally, and reduced motion disables the recoil. Selecting a project rolls its details open while the previous selection rolls closed.

## Open the portfolio

Open `index.html` directly in a modern browser. For a local server instead, install Node.js and run:

```sh
npm start
```

Then visit <http://127.0.0.1:4173>.

## GitHub Pages

Push the contents of this folder to your website repository. `index.html`, `styles.css`, `app.js`, `projects.js`, and `assets/` are already in the root, with relative URLs that work on both a `username.github.io` site and a repository subpath.

In the repository's **Settings > Pages**, choose **Deploy from a branch**, then **main** and **/ (root)**. Once that setting is in place, pushing to `main` updates the site. No build command, npm installation, or running server is needed on GitHub Pages. The included `.nojekyll` file keeps it a plain static site.

Edit project titles, descriptions, credits, and image paths in `projects.js`. Personal text and links are in `index.html`, and visual styles are in `styles.css`.

## Photography

Opening Photography plays a 2.15-second globe rotation and zoom into Japan,
then hands off to the existing SVG map and location markers. The plum/pink
globe uses bundled public-domain Natural Earth land geometry and the exact
Japan coastline of the destination map. It paints at 30 fps with capped
resolution and releases its canvas after landing. Leaving, resizing, hiding
the tab, or selecting a location ends the flight immediately. Reduced motion
and the compact mobile layout use the regular map/location chips directly.
`photo-map-intro.js` owns the flight; `photo-globe-data.js` can be regenerated
with `scripts/prepare-photo-globe.mjs` from Natural Earth's 1:110m land GeoJSON.

The Photography card in the logo menu (shortcut **F**) and the Photography link
in About open `#photography` with the shared screen and footer transitions.
A flat Japan map filters photos by Hokkaido, Gifu, Ine,
Nagoya, Osaka, Tokyo, Kyoto, or Nara. All photos restores the shuffled mix.
The vertical carousel fades at both edges, pauses for browsing, and opens
originals in the shared image viewer. Back or Escape returns to the menu or
About, depending on where the gallery was opened (direct links return to About).

About's personal blurb starts with a local CAPTCHA-style checkbox. Clicking it
shows a brief verification animation, changes the title to "I'm not a robot
either!", and expands the text. This is a visual joke, with no third-party
CAPTCHA or bot protection. It stays revealed until the page reloads; the
Photography link is always available, and reduced motion skips the animation.
The checkbox reserves its layout space while fading out, then the title appears
before the blurb opens, so the section only grows during verification.

The expanded photo viewer has left/right buttons and keyboard arrow controls
for the current shuffled carousel, including location filters and looping.
Arrows disappear for a single photo and project screenshots. Optional public
notes and tags can be entered in each region's `captions.json`; see the
[photo annotation example](assets/photography/README.md), then run `npm run photos`.

Add photos to the matching folders in `assets/photography/`, then run
`npm run photos` to refresh `photography-photos.js`. `npm start` refreshes it
automatically before serving. Optional captions and alt text are described in
[the photo folder guide](assets/photography/README.md).

The included WebP previews reduce gallery image downloads from about 67 MB to
6.3 MB; originals remain unchanged. To prepare previews after adding photos,
install Pillow (`python -m pip install Pillow`), run
`python scripts/prepare-photo-previews.py`, then `npm run photos`.
Photos without a prepared preview still work using the original image.
Commit the images, previews, and generated index together for GitHub Pages.

The map's mainland and Hokkaido silhouette is simplified from the public-domain
[Natural Earth 1:50m country dataset](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_50m_admin_0_countries.geojson).

## Live osu! stats

The header can display osu!standard level, level progress, and pp through a separate Cloudflare Worker. Follow [the setup instructions](workers/osu-stats/README.md). The site sends no stats request until the Worker's public URL is configured in `index.html`.

The rectangular player button keeps its About-page navigation and displays Nathan's osu! avatar, the name Nathan Chan in Aller, performance points, and a level bar. Unavailable stats use dashes until the first successful response. Aller is bundled with its original archive and licence in `assets/fonts/aller/`.

## Controls

The first visit in each tab plays the closing phrase of **Turbo - PADORU / PADORU (Sotarks) [Gift]**: all 28 objects from 26.590 to 31.642 seconds, including the two stacked triples and five circular sliders. Map coordinates, intervals, combo numbers, and inherited slider velocities come from the supplied `assets/beatmaps/padoru-gift.osu`. `intro-beatmap.js` contains the compiled excerpt; regenerate it with `node scripts/prepare-intro-beatmap.mjs` after changing the source. Playback is silent and uses a danser-style cursor with shared tangents and curved sweeps that scale down for stacked taps. The HUD simulates a full-map, no-mod osu!stable ScoreV1 SS: it enters the excerpt at 668,810 score / 159x, stays at 100.00% accuracy, and finishes at 968,510 score / 192x. Slider heads, ticks, repeats, and early tail checks contribute to the score and combo; K1/K2 counters include earlier notes too. The map's final hit stays at its original position. On that beat the menu logo grows independently from the centre, with the existing star burst, HUD hinges, and reveal offsets. The complete intro takes 6.662 seconds: a 570 ms approach lead-in, the 5.052-second phrase, and a 1.040-second menu reveal. The bundled WhiteCat base and overlay retain the larger 110-unit diameter and AR 9.2 (570 ms approach and 380 ms fade-in). Click or press **Enter** to skip; that input is consumed, so the menu stays closed. Tab, Escape, and Space also dismiss it. The site's Motion reduced setting uses a brief fade; the Windows/system animation setting does not disable startup. Deep links go directly to their destination. Resizing, leaving the tab, or a failed animation restores the normal interface.

For local review, open `http://127.0.0.1:4173/?intro=replay` to replay despite the session flag. Add `&introAt=4500` to hold a specific millisecond for up to the recovery deadline (9 seconds), or use `?intro=off` to bypass it. The last map hit occurs at intro time 5622 ms; the menu becomes interactive at 6662 ms and the remaining stars finish by 8122 ms. These switches only work on localhost or a directly opened file; production URLs cannot force a replay.

Gameplay (`intro-gameplay.js`) and the final star burst (`intro-stars.js`) share one visible canvas and one elapsed-time clock. Gameplay is capped at 75 fps; the falling-star tail is capped at 50 fps. Each slider is rasterized once to a tightly bounded offscreen texture, trail positions update at 30 Hz, hidden objects are culled, and unchanged logo/HUD values do not rewrite styles or attributes. Changing intro styles stay on their consuming elements instead of inheriting from the document root. The logo face, rim, and shadow are painted at their final appearance and faded in as one layer during the scale morph, rather than repainting changing colors and blurred shadows every frame. The real menu logo and three hinged HUD boards remain DOM elements to preserve their transitions; the HUD is removed after falling away. HUD digits share one preloaded texture instead of swapping image URLs during score changes. Regenerate that texture after changing skin glyphs with `python scripts/prepare-intro-digits.py` (Pillow required).

The canvas reuses a star rotation atlas, caps resolution at 1.5x and two million pixels, and culls offscreen stars. Devices reporting at most four cores or 4 GB memory start with a lighter preset (72 desktop / 48 mobile stars, at most one million pixels). Slower gameplay cadence can also select fewer stars at the slider start, keeping the initial canvas resolution to avoid a backing-store reallocation during the final hit. The full preset retains 120 / 72 stars; both keep the full fan and 500 ms declining emission. Cleanup releases the canvas and sprite backing stores; browsers without a 2D canvas immediately reveal the usable menu. `SiteIntro.busy` and `site:intro-idle` cover both gameplay and the remaining star tail, so automatic project screenshot downloads/decodes wait until the whole effect finishes. Opening Projects still requests its images immediately.

For a real browser performance test, use `http://127.0.0.1:4173/?intro=replay&introPerf=1` in a foreground tab. The on-page report and `window.IntroPerformance.lastResult` record average fps, 1% low fps, and sample counts separately for gameplay and the falling-star tail, with viewport, DPR, and browser information in the result. Each phase also lists its five slowest intervals and their times relative to that phase, making it easier to distinguish startup, individual hits, and the menu reveal. Average fps is total rendered intervals divided by elapsed time; 1% low is 1000 divided by the mean of the slowest 1% of frame times (rounded up). Samples come from actual render calls, not every display refresh, and include stalls. Skips, resize, navigation, and hidden tabs mark a run interrupted. Static `introAt` reviews and production URLs cannot enable benchmarking. The tail is short, so compare several foreground runs at the same viewport/refresh rate and keep sample counts alongside the metrics. These measurements describe frame submission cadence, not GPU presentation timings. Unit tests verify scheduling and metric math; they are not hardware fps measurements.

- Click the circle or press **Enter** to open the main menu; repeat to enter Projects. **Esc** closes the menu.
- Press **P** for projects, **A** for about, and **Esc** to go back.
- Use the arrow keys to move through selections, **/** to search, and **F2** for a random project.
- Press **Enter** on a selected project to open its case study. Mouse and touch controls are also available.
- Move the pointer anywhere over the project screen to fan the cards. The stack rests further right, with a stronger selected-project peak and a deeper cursor pull that follows a running average of the pointer's height. Move it across the home scene to shift the parallax layers.
- The home circle uses a one-second bouncy pulse, and project previews fade as the selection changes. Screenshots download and decode in the background when the menu opens, or earlier during idle time on an unrestricted connection.
- During startup, a single scripted cursor makes curved, danser-inspired sweeps with continuous momentum through each hit. Its path joins every slider tangentially and finishes at the last map note, while the menu logo grows separately at the centre; it uses the same WhiteCat sprites and fading snapshots as the normal cursor.
- Motion is on by default. Use the motion toggle to reduce animation; your choice is remembered.

## Project checks

With Node.js installed, run the source and content checks:

```sh
npm run check
```

These check JavaScript syntax, project records, screenshot files, local asset references, control wiring, accessibility markup, and animation declarations. They do not replace a visual browser review.

## Design reference

The interaction draws on the classic osu!stable client interface and its circle button:

- <https://osu.ppy.sh/wiki/en/Client/Interface>
- <https://osu.ppy.sh/wiki/en/Client/Interface/Cookie>

Project images are genuine project photos/screenshots. Future additions could include a two-driver F1 delta screenshot, short demo recordings, a portrait, and the crane's Arduino sketch or wiring diagram.
