# Nathan Chan — portfolio

A local, offline portfolio inspired by osu!stable’s interface. It is a static site and needs no dependency installation.

This entire `nathan-portfolio` folder is the repository root. Everything required to run the site is included inside it.

The portfolio presents four projects, led by **atNathanOsu**, a Java rhythm game with standard and four-key modes.

Desktop content fills more of the viewport while keeping an outer margin. Typography, cards, controls, and spacing scale together on larger screens; mobile retains its compact layout. Images keep their original layout proportions.

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

## Controls

- Click the circle or press **Enter** to open the main menu; repeat to enter Projects. **Esc** closes the menu.
- Press **P** for projects, **A** for about, and **Esc** to go back.
- Use the arrow keys to move through selections, **/** to search, and **F2** for a random project.
- Press **Enter** on a selected project to open its case study. Mouse and touch controls are also available.
- Move the pointer anywhere over the project screen to fan the cards. The stack rests further right, with a stronger selected-project peak and a deeper cursor pull that follows a running average of the pointer's height. Move it across the home scene to shift the parallax layers.
- The home circle uses a one-second bouncy pulse, and project previews fade as the selection changes. Screenshots download and decode in the background when the menu opens, or earlier during idle time on an unrestricted connection.
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
