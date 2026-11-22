import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const root = dirname(fileURLToPath(import.meta.url));
const dist = root;
const html = readFileSync(resolve(dist, 'index.html'), 'utf8');
const app = readFileSync(resolve(dist, 'app.js'), 'utf8');
const css = readFileSync(resolve(dist, 'styles.css'), 'utf8');
const data = readFileSync(resolve(dist, 'projects.js'), 'utf8');
let count = 0;
function check(name, test) { test(); count++; console.log(`PASS ${name}`); }

check('Application JavaScript parses', () => new vm.Script(app));
const context = { window: {} };
vm.createContext(context);
check('Project content JavaScript parses and runs', () => vm.runInContext(data, context));
const projects = context.window.PORTFOLIO_PROJECTS;
check('All four actual projects are present', () => assert.deepEqual(Array.from(projects, p => p.id).sort(), ['atnathanosu', 'crane', 'f1', 'market']));
check('The rhythm game is featured first', () => assert.equal(projects[0].id, 'atnathanosu'));
check('Project IDs are unique', () => assert.equal(new Set(projects.map(p => p.id)).size, projects.length));
check('All projects have descriptions, engineering details and contributions', () => {
  for (const project of projects) {
    for (const key of ['title', 'subtitle', 'summary', 'description', 'engineering', 'contribution']) assert.ok(project[key]?.length > 5, `${project.id}: ${key}`);
    assert.ok(project.stack.length && project.highlights.length && project.images.length);
    assert.equal(project.facts.length, 3);
    assert.ok(['software', 'hardware'].includes(project.category));
  }
});
check('Teammate contributions are credited', () => {
  assert.match(projects.find(p => p.id === 'atnathanosu').contribution, /Adrian Tang/);
  assert.match(projects.find(p => p.id === 'market').contribution, /Jerry/);
  assert.match(projects.find(p => p.id === 'crane').contribution, /partner.*wiring/i);
});
check('All project screenshots exist and are PNGs', () => {
  for (const project of projects) for (const image of project.images) {
    const path = resolve(dist, image.src);
    assert.ok(path.startsWith(dist));
    assert.ok(existsSync(path), image.src);
    assert.ok(statSync(path).size > 1000);
    assert.equal(readFileSync(path).subarray(0, 8).toString('hex'), '89504e470d0a1a0a', image.src);
    assert.ok(image.alt && image.caption);
  }
});
check('All local HTML assets exist', () => {
  for (const [, value] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    if (/^(?:https?:|mailto:|#)/.test(value)) continue;
    assert.ok(existsSync(resolve(dist, value)), value);
  }
});
check('All stylesheet image assets exist', () => {
  for (const [, path] of css.matchAll(/url\(['"]?([^)'"\s]+)['"]?\)/g)) assert.ok(existsSync(resolve(dist, path)), path);
});
check('HTML IDs are unique', () => {
  const ids = Array.from(html.matchAll(/\bid="([^"]+)"/g), match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
});
check('Main menu has the two requested destinations', () => {
  const menu = html.match(/<nav class="main-menu"[\s\S]*?<\/nav>/)[0];
  assert.equal((menu.match(/class="menu-entry /g) || []).length, 2);
  assert.match(menu, /data-go="projects"/); assert.match(menu, /data-go="about"/);
});
check('The menu pulse uses the one-second bouncy cycle', () => {
  assert.match(css, /animation:heartbeat\s+1s\s+linear\s+infinite/);
  assert.match(css, /@keyframes heartbeat\{0%\{transform:scale\(1\)\}72%\{transform:scale\(1\.0105\)\}82%\{transform:scale\(\.9976\)\}91%\{transform:scale\(1\.0024\)\}100%\{transform:scale\(1\)\}\}/);
});
check('Reduced-motion handling and preference control are present', () => { assert.match(css, /prefers-reduced-motion/); assert.match(app, /nathan-motion/); assert.match(html, /id="motion-toggle"/); });
check('Case study and image viewer are real labelled dialogs', () => { assert.match(html, /<dialog[^>]+id="case-study-dialog"[^>]+aria-labelledby=/); assert.match(html, /<dialog[^>]+id="lightbox"[^>]+aria-label=/); });
check('No external dependencies or analytics are loaded', () => { assert.doesNotMatch(html, /<(?:script|link)[^>]+(?:src|href)="https?:/); assert.doesNotMatch(app, /\bfetch\s*\(|XMLHttpRequest|sendBeacon/); });
check('Search, filter, random selection and history controls are connected', () => {
  for (const id of ['project-search', 'project-sort', 'random-project', 'back-button', 'main-cookie']) assert.ok(app.includes(`$('#${id}').addEventListener`), id);
  assert.match(app, /window\.addEventListener\('popstate'/);
  assert.match(app, /event\.key === 'ArrowDown'/);
});
check('Audio controls and runtime are absent', () => { assert.doesNotMatch(html, /audio-toggle|jukebox|track-state|track-name/); assert.doesNotMatch(app, /AudioContext|audio-toggle|track-state|track-name/); });
check('About page has no portfolio PDF download', () => { assert.doesNotMatch(html, /portfolio-download|Nathan_Chan_Project_Portfolio\.pdf|\bdownload\b/i); });

console.log(`\n${count} checks passed. These are source/content checks, not a browser rendering test.`);
