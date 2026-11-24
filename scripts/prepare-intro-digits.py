"""Pack the original WhiteCat HUD glyphs without resizing or changing pixels."""
from pathlib import Path

from PIL import Image

skin = Path(__file__).resolve().parent.parent / "assets" / "whitecat"
glyphs = [("score", str(n)) for n in range(10)]
glyphs += [("score", "dot"), ("score", "percent"), ("combo", "x")]
atlas = Image.new("RGBA", (60 * len(glyphs), 80))
for index, (prefix, name) in enumerate(glyphs):
    with Image.open(skin / f"{prefix}-{name}@2x.png") as glyph:
        atlas.paste(glyph.convert("RGBA"), (index * 60, 0))
atlas.save(skin / "intro-digits@2x.png", optimize=True)
