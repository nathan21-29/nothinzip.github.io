# WhiteCat cursor assets

Cursor artwork from **WhiteCat (1.0)** by **cyperdark**, supplied from Nathan's installed osu! skin.

Skin: <https://osu.ppy.sh/community/forums/topics/986201?n=1>

- `cursor@2x.png` and `cursortrail@2x.png` are the original skin sprites.
- `hitcircle@2x.png`, `approachcircle@2x.png`, and `hitcircleoverlay@2x.png` are the original skin sprites used for startup hit circles, including the fifth circle as it morphs into the menu logo. The scripted slider is an SVG curve so it scales cleanly with the playfield. Numbers use the original skin’s `default-1@2x.png` through `default-5@2x.png` sprites.
- `cursor-0.7x.png` is the high-resolution cursor downsampled to 90 × 90 pixels: the skin's 128-pixel logical cursor size at Nathan's requested 0.7× size, rounded to the nearest pixel. The hotspot is centred at (45, 45).
- `cursor-pressed-92.png` through `cursor-pressed-108.png` are preloaded, centred size frames. Holding Mouse1 enlarges the cursor by 20%; releasing returns it to the 0.7× resting size. Inflation and deflation each last 200 ms with quintic ease-out, including a very slow final approach. Quick reversals start at the current size, and lost focus or a cancelled pointer resets the cursor. Reduced motion switches sizes immediately.
- Trail sprites use the same 0.7× scale (64 × 0.7 = 44.8 CSS pixels), retaining their original size throughout each fade.

`cursor.js` captures separate pointer positions at approximately 60 Hz and fades each snapshot in place over 150 ms. Faster motion spreads the snapshots farther apart; slower motion packs them together. It does not interpolate additional positions, connect the dots, or rotate. Trail snapshots keep their size while the cursor expands. The 60 Hz cadence follows classic osu! cursor behaviour without `cursormiddle.png`; the fade duration is a website tuning value.

Behaviour reference (peppy's explanation): <https://osu.ppy.sh/community/forums/topics/119648>

The native cursor stays responsive without waiting for JavaScript animation. The trail follows the site's Motion toggle and its remembered setting, using the portfolio's existing preference handling. Touch interaction keeps its normal behaviour.
