"""Extract available exposure settings from originals. Requires Pillow."""
import json
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parent.parent / 'assets' / 'photography'
metadata = {}
for path in sorted(root.rglob('*')):
    if path.suffix.lower() not in {'.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif'}:
        continue
    with Image.open(path) as image:
        exif = image.getexif()
        values = dict(exif)
        try:
            values.update(exif.get_ifd(34665))
        except (KeyError, TypeError, ValueError):
            pass
        parts = []
        iso = values.get(34855) or values.get(34867)
        exposure = values.get(33434)
        aperture = values.get(33437)
        focal = values.get(37386)
        if iso:
            parts.append(f'ISO {iso}')
        if exposure and float(exposure) > 0:
            seconds = float(exposure)
            shutter = f'1/{round(1 / seconds)}' if seconds < 1 else f'{seconds:g}s'
            parts.append(f'SS {shutter}')
        if aperture:
            parts.append(f'ƒ{float(aperture):g}')
        if focal:
            parts.append(f'{float(focal):g}mm')
        if parts:
            metadata[path.relative_to(root).as_posix()] = ' | '.join(parts)
(root / 'camera-metadata.json').write_text(json.dumps(metadata, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
print(f'Exposure metadata found for {len(metadata)} photos.')
