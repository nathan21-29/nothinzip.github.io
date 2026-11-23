# Nathan Chan — portfolio

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

## Live osu! stats

The header can display osu!standard level, level progress, and pp through a separate Cloudflare Worker. Follow [the setup instructions](workers/osu-stats/README.md). The site sends no stats request until the Worker's public URL is configured in `index.html`.

The rectangular player button keeps its About-page navigation and displays Nathan's osu! avatar, the name Nathan Chan in Aller, performance points, and a level bar. Unavailable stats use dashes until the first successful response. Aller is bundled with its original archive and licence in `assets/fonts/aller/`.

## Controls

The first visit in each tab plays a silent 3.86-second osu!standard startup: three hit circles, a curved slider, and a fifth hit that grows into the actual menu circle. The intro uses the bundled WhiteCat cursor, trail, approach ring, and hit-circle overlay. Click or press **Enter** to skip; that input is consumed, so the menu stays closed. Tab, Escape, and Space also dismiss it. The site’s Motion reduced setting uses a brief fade; the Windows/system animation setting does not disable startup. Hit circles use the bundled WhiteCat base and overlay at a larger 110-unit diameter, with AR 9.2 (570 ms approach and 380 ms fade-in). Deep links go directly to their destination. Resizing, leaving the tab, or a failed animation restores the normal interface.

For local review, open `http://127.0.0.1:4173/?intro=replay` to replay despite the session flag. Add `&introAt=1820` to hold a specific millisecond for up to the recovery deadline (4.8 seconds), or use `?intro=off` to bypass it. These switches only work on localhost or a directly opened file; production URLs cannot force a replay.

The final star burst uses a separate canvas renderer in `intro-stars.js` on that same clock. It reuses a small rotation atlas, caps resolution at 1.5x and two million pixels, and culls offscreen stars. Devices reporting at most four cores or 4 GB memory, or averaging slower than 23 ms per frame during gameplay, use a lighter preset (72 desktop / 48 mobile stars, at most one million pixels). The full preset retains 120 / 72 stars; both keep the full fan and 500 ms declining emission. Cleanup releases the canvas and sprite backing stores, and browsers without a 2D canvas still complete the intro.

- Click the circle or press **Enter** to open the main menu; repeat to enter Projects. **Esc** closes the menu.
- Press **P** for projects, **A** for about, and **Esc** to go back.
- Use the arrow keys to move through selections, **/** to search, and **F2** for a random project.
- Press **Enter** on a selected project to open its case study. Mouse and touch controls are also available.
- Move the pointer anywhere over the project screen to fan the cards. The stack rests further right, with a stronger selected-project peak and a deeper cursor pull that follows a running average of the pointer's height. Move it across the home scene to shift the parallax layers.
- The home circle uses a one-second bouncy pulse, and project previews fade as the selection changes. Screenshots download and decode in the background when the menu opens, or earlier during idle time on an unrestricted connection.
- During startup, a single scripted cursor makes curved, danser-inspired sweeps with continuous momentum through each hit. Its path joins the slider tangentially and settles exactly at the logo's center; it uses the same WhiteCat sprites and fading snapshots as the normal cursor.
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

Project images are genuine project photos/screenshots. Future additions could include a two-driver F1 delta screenshot, short demo recordings, a portrait, and the crane’s Arduino sketch or wiring diagram.
