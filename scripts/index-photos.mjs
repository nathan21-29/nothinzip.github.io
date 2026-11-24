import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const locations = ['hokkaido', 'gifu', 'ine', 'nagoya', 'osaka', 'tokyo', 'kyoto', 'nara'];
const formats = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif']);

// Previews are EXIF-oriented already. Reserve their display dimensions before
// lazy images load, including in the copies used by the infinite stream.
function webpDimensions(data) {
  if (data.toString('ascii', 0, 4) !== 'RIFF' || data.toString('ascii', 8, 12) !== 'WEBP') return {};
  for (let offset = 12; offset + 8 <= data.length;) {
    const type = data.toString('ascii', offset, offset + 4);
    const size = data.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (start + size > data.length) return {};
    if (type === 'VP8X' && size >= 10) return { width: data.readUIntLE(start + 4, 3) + 1, height: data.readUIntLE(start + 7, 3) + 1 };
    if (type === 'VP8 ' && size >= 10) return { width: data.readUInt16LE(start + 6) & 0x3fff, height: data.readUInt16LE(start + 8) & 0x3fff };
    if (type === 'VP8L' && size >= 5) {
      const bits = data.readUInt32LE(start + 1);
      return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
    offset = start + size + (size % 2);
  }
  return {};
}

async function scan(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.filter(entry => !entry.name.startsWith('.')).map(async entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return scan(path);
    return entry.isFile() && formats.has(extname(entry.name).toLowerCase()) ? [path] : [];
  }));
  return files.flat().sort();
}

async function readCaptions(directory) {
  const file = join(directory, 'captions.json');
  let captions;
  try { captions = JSON.parse(await readFile(file, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') return {};
    throw new Error(`Unable to read ${file}: ${error.message}`, { cause: error });
  }
  if (!captions || Array.isArray(captions) || typeof captions !== 'object') {
    throw new Error(`${file} must contain an object keyed by relative photo filename.`);
  }
  for (const [filename, entry] of Object.entries(captions)) {
    if (!entry || Array.isArray(entry) || typeof entry !== 'object' ||
        ['caption', 'alt', 'note'].some(key => entry[key] !== undefined && typeof entry[key] !== 'string') ||
        (entry.tags !== undefined && (!Array.isArray(entry.tags) || entry.tags.some(tag => typeof tag !== 'string')))) {
      throw new Error(`${file}: ${filename} must contain optional string caption, alt and note fields, and tags must be an array of strings.`);
    }
  }
  return captions;
}

export async function buildPhotoIndex(root = defaultRoot) {
  const photoRoot = join(root, 'assets', 'photography');
  let cameraMetadata = {};
  try { cameraMetadata = JSON.parse(await readFile(join(photoRoot, 'camera-metadata.json'), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const directories = await readdir(photoRoot, { withFileTypes: true });
  const unknown = directories.filter(entry => entry.isDirectory() && !entry.name.startsWith('.') && !locations.includes(entry.name));
  if (unknown.length) {
    throw new Error(`Unknown photography folder${unknown.length === 1 ? '' : 's'}: ${unknown.map(entry => entry.name).join(', ')}. Add each location to photography-data.js and scripts/index-photos.mjs, or move its photos into a configured location folder. Existing photo index was not changed.`);
  }
  const photos = [];
  for (const city of locations) {
    const directory = join(root, 'assets', 'photography', city);
    const captions = await readCaptions(directory);
    for (const path of await scan(directory)) {
      const filename = relative(directory, path).split(sep).join('/');
      const stem = filename.slice(filename.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '');
      const name = stem.replace(/[-_]+/g, ' ');
      const cameraFilename = /^(?:_?DSC|IMG_)/i.test(stem);
      const caption = captions[filename]?.caption ?? (cameraFilename ? '' : name.charAt(0).toUpperCase() + name.slice(1));
      const cityName = city.charAt(0).toUpperCase() + city.slice(1);
      const photo = {
        id: `${city}/${filename}`,
        city,
        src: relative(root, path).split(sep).map(encodeURIComponent).join('/'),
        caption,
        alt: captions[filename]?.alt || (caption ? `${caption} — ${cityName}` : `${cityName} photograph`)
      };
      if (cameraMetadata[`${city}/${filename}`]) photo.camera = cameraMetadata[`${city}/${filename}`];
      if (captions[filename]?.note) photo.note = captions[filename].note;
      if (captions[filename]?.tags?.length) photo.tags = captions[filename].tags;
      const previewPath = join(root, 'assets', 'photography-previews', city, `${filename}.webp`);
      try {
        if ((await stat(previewPath)).isFile()) {
          photo.preview = relative(root, previewPath).split(sep).map(encodeURIComponent).join('/');
          Object.assign(photo, webpDimensions(await readFile(previewPath)));
        }
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
      photos.push(photo);
    }
  }
  return photos;
}

export async function writePhotoIndex(root = defaultRoot) {
  const photos = await buildPhotoIndex(root);
  const output = `/* Generated by scripts/index-photos.mjs. */\nwindow.PHOTOGRAPHY_PHOTOS = ${JSON.stringify(photos, null, 2)};\n`;
  const target = join(root, 'photography-photos.js');
  let current;
  try { current = await readFile(target, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (current !== output) await writeFile(target, output);
  return photos;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const photos = await writePhotoIndex();
  console.log(`Indexed ${photos.length} photos across ${locations.length} locations.`);
  console.log(locations.map(city => `${city}: ${photos.filter(photo => photo.city === city).length}`).join(', '));
}
