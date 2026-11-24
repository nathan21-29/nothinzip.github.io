import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { buildPhotoIndex, writePhotoIndex } from '../scripts/index-photos.mjs';

const regions = ['hokkaido', 'gifu', 'ine', 'nagoya', 'osaka', 'tokyo', 'kyoto', 'nara'];

async function fixture(t) {
  const prefix = join(tmpdir(), 'nathan-photo-index-');
  const root = await mkdtemp(prefix);
  assert.ok(root.startsWith(prefix));
  t.after(() => rm(root, { recursive: true, force: true }));
  await Promise.all(regions.map(region => mkdir(join(root, 'assets', 'photography', region), { recursive: true })));
  return {
    root,
    async put(region, filename, contents = 'image fixture') {
      const target = join(root, 'assets', 'photography', region, filename);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, contents);
      return target;
    }
  };
}

test('Photo index keeps all eight regions separate and recursively includes supported images', async t => {
  const { root, put } = await fixture(t);
  await Promise.all(regions.map((region, i) => put(region, `image${['.JPG', '.jpeg', '.png', '.webp', '.avif', '.gif'][i % 6]}`)));
  await put('ine', 'evening/boathouses.jpg');
  await put('tokyo', 'notes.txt');
  await put('tokyo', 'camera.NEF');
  await put('tokyo', '.private.jpg');
  await put('tokyo', '.drafts/photo.jpg');
  const photos = await buildPhotoIndex(root);
  assert.equal(photos.length, 9);
  assert.deepEqual([...new Set(photos.map(photo => photo.city))], regions);
  assert.equal(photos.find(photo => photo.id === 'ine/evening/boathouses.jpg').caption, 'Boathouses');
  assert.equal(new Set(photos.map(photo => photo.id)).size, photos.length);
});

test('Unknown location folders produce an actionable error and preserve the existing index', async t => {
  const { root, put } = await fixture(t);
  const manifest = join(root, 'photography-photos.js');
  await writeFile(manifest, 'existing working index');
  await put('kanazawa', 'night.jpg');
  await assert.rejects(writePhotoIndex(root), /Unknown photography folder: kanazawa.*photography-data\.js/);
  assert.equal(await readFile(manifest, 'utf8'), 'existing working index');
});

test('Photo URLs preserve Unicode, spaces, percent, and fragment characters', async t => {
  const { root, put } = await fixture(t);
  // Question marks are not valid in Windows filenames, so verify URL escaping
  // with characters that work on every supported filesystem.
  await put('tokyo', '夜景 #100%.JPG');
  const [photo] = await buildPhotoIndex(root);
  assert.equal(photo.src, 'assets/photography/tokyo/%E5%A4%9C%E6%99%AF%20%23100%25.JPG');
  assert.equal(await readFile(join(root, decodeURIComponent(photo.src)), 'utf8'), 'image fixture');
});

test('Regional captions support nested filenames and meaningful fallback alt text', async t => {
  const { root, put } = await fixture(t);
  await put('ine', 'water/evening-in-ine.jpg');
  await put('ine', 'morning-light.jpg');
  await put('ine', 'captions.json', JSON.stringify({
    'water/evening-in-ine.jpg': { caption: 'Evening on the water', alt: 'Boathouses reflected in the bay at Ine' }
  }));
  const photos = await buildPhotoIndex(root);
  assert.equal(photos[0].caption, 'Morning light');
  assert.equal(photos[0].alt, 'Morning light — Ine');
  assert.equal(photos[1].caption, 'Evening on the water');
  assert.equal(photos[1].alt, 'Boathouses reflected in the bay at Ine');
});

test('Optional photo notes and tags survive indexing and reject malformed annotations', async t => {
  const { root, put } = await fixture(t);
  await put('hokkaido', 'IMG_0977.JPG');
  await put('hokkaido', 'IMG_0984.JPG');
  const annotation = { note: 'Snow at dawn.\nWorth the early start.', tags: ['snow', 'favourite'] };
  await put('hokkaido', 'captions.json', JSON.stringify({ 'IMG_0977.JPG': annotation }));
  const photos = await buildPhotoIndex(root);
  assert.equal(photos[0].note, annotation.note);
  assert.deepEqual(photos[0].tags, annotation.tags);
  assert.equal(photos[1].note, undefined);
  assert.equal(photos[1].tags, undefined);
  for (const invalid of [{ note: 42 }, { tags: 'snow' }, { tags: ['snow', 42] }]) {
    await put('hokkaido', 'captions.json', JSON.stringify({ 'IMG_0977.JPG': invalid }));
    await assert.rejects(buildPhotoIndex(root), /captions\.json: IMG_0977\.JPG/);
  }
});

test('Camera filenames stay out of captions while custom captions and human filenames remain visible', async t => {
  const { root, put } = await fixture(t);
  for (const filename of ['_DSC5712.jpg', 'DSC_1234.jpg', 'DSC9000.jpg', 'IMG_0985.JPG', 'subfolder/img_0032.jpg']) {
    await put('tokyo', filename);
  }
  await put('tokyo', 'city-at-night.jpg');
  await put('tokyo', 'captions.json', JSON.stringify({
    '_DSC5712.jpg': { caption: 'Blue hour in Tokyo', alt: 'A quiet street at blue hour' }
  }));
  const photos = await buildPhotoIndex(root);
  const custom = photos.find(photo => photo.id.endsWith('/_DSC5712.jpg'));
  assert.equal(custom.caption, 'Blue hour in Tokyo');
  assert.equal(custom.alt, 'A quiet street at blue hour');
  const human = photos.find(photo => photo.id.endsWith('/city-at-night.jpg'));
  assert.equal(human.caption, 'City at night');
  assert.equal(human.alt, 'City at night — Tokyo');
  const camera = photos.filter(photo => photo !== custom && photo !== human);
  assert.equal(camera.length, 4);
  assert.ok(camera.every(photo => photo.caption === '' && photo.alt === 'Tokyo photograph'));
});

test('Existing WebP previews map to matching original filenames and nested paths without replacing the originals', async t => {
  const { root, put } = await fixture(t);
  await put('tokyo', '夜景 #100%.JPG');
  await put('tokyo', 'nested/_DSC5712.jpg');
  await put('tokyo', 'no-preview.jpg');
  for (const filename of ['夜景 #100%.JPG.webp', 'nested/_DSC5712.jpg.webp']) {
    const previewPath = join(root, 'assets', 'photography-previews', 'tokyo', filename);
    await mkdir(dirname(previewPath), { recursive: true });
    await writeFile(previewPath, 'preview fixture');
  }
  const photos = await buildPhotoIndex(root);
  const encoded = photos.find(photo => photo.id.endsWith('/夜景 #100%.JPG'));
  assert.equal(encoded.preview, 'assets/photography-previews/tokyo/%E5%A4%9C%E6%99%AF%20%23100%25.JPG.webp');
  assert.equal(encoded.src, 'assets/photography/tokyo/%E5%A4%9C%E6%99%AF%20%23100%25.JPG');
  const nested = photos.find(photo => photo.id.endsWith('/nested/_DSC5712.jpg'));
  assert.equal(nested.preview, 'assets/photography-previews/tokyo/nested/_DSC5712.jpg.webp');
  assert.equal(nested.src, 'assets/photography/tokyo/nested/_DSC5712.jpg');
  assert.ok(!Object.hasOwn(photos.find(photo => photo.id.endsWith('/no-preview.jpg')), 'preview'));
});

test('Malformed captions fail with a useful filename before replacing a working index', async t => {
  const { root, put } = await fixture(t);
  const manifest = join(root, 'photography-photos.js');
  await writeFile(manifest, 'existing working index');
  for (const contents of ['{broken', 'null', '[]', '{"photo.jpg":{"alt":42}}']) {
    await put('gifu', 'captions.json', contents);
    await assert.rejects(writePhotoIndex(root), /captions\.json/);
    assert.equal(await readFile(manifest, 'utf8'), 'existing working index');
  }
});

test('Preview dimensions reserve the oriented aspect ratio before images load', async t => {
  const { root, put } = await fixture(t);
  await put('kyoto', 'portrait.jpg');
  const preview = join(root, 'assets', 'photography-previews', 'kyoto', 'portrait.jpg.webp');
  await mkdir(dirname(preview), { recursive: true });
  // A VP8X canvas header, as used by previews with colour profiles.
  const data = Buffer.alloc(30);
  data.write('RIFF');
  data.writeUInt32LE(22, 4);
  data.write('WEBPVP8X', 8);
  data.writeUInt32LE(10, 16);
  data.writeUIntLE(1066, 24, 3);
  data.writeUIntLE(1599, 27, 3);
  await writeFile(preview, data);
  const [photo] = await buildPhotoIndex(root);
  assert.equal(photo.width, 1067);
  assert.equal(photo.height, 1600);
});

test('Generated browser manifest updates after deletion and leaves unchanged files untouched', async t => {
  const { root, put } = await fixture(t);
  const image = await put('osaka', 'night.jpg');
  await writePhotoIndex(root);
  const manifest = join(root, 'photography-photos.js');
  const context = { window: {} };
  vm.runInNewContext(await readFile(manifest, 'utf8'), context);
  assert.equal(context.window.PHOTOGRAPHY_PHOTOS[0].city, 'osaka');
  const oldTime = new Date('2000-01-01T00:00:00Z');
  await utimes(manifest, oldTime, oldTime);
  await writePhotoIndex(root);
  assert.equal((await stat(manifest)).mtimeMs, oldTime.getTime());
  await rm(image);
  await writePhotoIndex(root);
  vm.runInNewContext(await readFile(manifest, 'utf8'), context);
  assert.equal(context.window.PHOTOGRAPHY_PHOTOS.length, 0);
});
