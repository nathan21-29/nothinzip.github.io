# Japan photography

Put photos into their matching folders: `hokkaido`, `gifu`, `ine`, `nagoya`,
`osaka`, `tokyo`, `kyoto`, and `nara`. Hokkaido is a single collection; each other location
has its own collection.

Use JPEG, PNG, WebP, AVIF, or GIF files that browsers can display. Export camera
RAW and HEIC files to one of those formats first. Subfolders are supported.
Keep web exports reasonably sized (around 2000 pixels on the long edge).

Run `npm run photos` after adding, removing, or renaming images. `npm start`
also refreshes the photo index before serving the site. Commit the images
and `photography-photos.js` together for GitHub Pages.

Human filenames become captions: `evening-in-ine.jpg` displays as “Evening in ine”.
Camera filenames such as `_DSC5846.jpg` or `IMG_0985.JPG` have no visible caption
and use a location-based alt description until custom text is supplied.
To supply a custom caption or alt text, add an optional `captions.json` in the
region folder, keyed by the relative filename (use `/` for subfolders):

```json
{
  "evening-in-ine.jpg": {
    "caption": "Evening on the water",
    "alt": "Wooden boathouses reflecting in the calm water at Ine"
  }
}
```

Indexing includes all eight collections and ignores hidden files, hidden folders,
and unsupported formats. Filenames containing spaces, Unicode, `#`, or `%` work.
Invalid caption files stop indexing and identify the file that needs correcting;
the existing photo index remains available until the error is fixed.
Unknown location folders also stop indexing with an explanation. To add a new
location, add its map coordinates to `photography-data.js` and its folder ID to
the location list in `scripts/index-photos.mjs` before indexing again.

Optional lightweight previews live under `assets/photography-previews`, using
the original location and relative filename followed by `.webp`. For example,
`tokyo/_DSC5712.jpg` has a preview at
`assets/photography-previews/tokyo/_DSC5712.jpg.webp`. Nested paths are preserved.
Indexing uses a preview only when that file exists, while keeping the original
image path for the full-size viewer. Run `npm run photos` after creating previews.

The gallery starts with a shuffled mix of all photos. Map markers filter it by
location; All photos restores the mix. The vertical stream pauses on hover,
keyboard focus, touch, while the image viewer is open, and when the tab is hidden.
Its pause control and the site's Motion control also stop automatic scrolling.
