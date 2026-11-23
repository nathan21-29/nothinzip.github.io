"""Create cached WebP gallery previews without modifying the original photos.

Requires Pillow: python -m pip install Pillow
Run this before npm run photos after adding images.
"""
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "assets" / "photography"
TARGET = ROOT / "assets" / "photography-previews"
FORMATS = {".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif"}


def prepare():
    count = 0
    total_bytes = 0
    for source in sorted(SOURCE.rglob("*")):
        if not source.is_file() or source.suffix.lower() not in FORMATS:
            continue
        relative = source.relative_to(SOURCE)
        if any(part.startswith(".") for part in relative.parts):
            continue
        target = TARGET / relative.with_name(relative.name + ".webp")
        target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists() or target.stat().st_mtime < source.stat().st_mtime:
            with Image.open(source) as original:
                image = ImageOps.exif_transpose(original)
                image.thumbnail((1600, 1600), Image.Resampling.LANCZOS)
                if image.mode not in ("RGB", "RGBA"):
                    image = image.convert("RGB")
                image.save(target, "WEBP", quality=84, method=6, icc_profile=original.info.get("icc_profile", b""))
        count += 1
        total_bytes += target.stat().st_size
    print(f"Prepared {count} previews ({total_bytes / 1_000_000:.2f} MB); originals unchanged.")


if __name__ == "__main__":
    prepare()
