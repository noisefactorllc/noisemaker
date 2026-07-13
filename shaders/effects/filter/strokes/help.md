# strokes

Directional brush-mark engine with angled, sprayed, dark, sumi-e, and smudge modes.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| mode | int | angled | angled/sprayed/dark/sumiE/smudge | Stroke style |
| length | float | 40 | 0-100 | Coherent brush-mark length (3-50px base) |
| balance | float | 50 | 0-100 | Angled tone split or Dark shadow split; inactive in other modes |
| intensity | float | 50 | 0-100 | Spray radius, Dark crush, or Sumi-e pressure; inactive in Angled and Smudge |
| sharpness | float | 30 | 0-100 | Post-smear unsharp strength |

## Modes

- **angled** (default) -- two fields of coherent diagonal pigment stamps (45deg and 135deg); light tones read one direction and dark tones the other, split at `balance`.
- **sprayed** -- single 45deg smear field with each tap scattered by a random 2D jitter scaled by `intensity`, so strokes read as a spray of dabs instead of a clean line.
- **dark** -- single 45deg smear field, then a tone-dependent contrast curve: shadows below `balance` crush further (darken), highlights above lift slightly, both scaled by `intensity`.
- **sumiE** -- a conditional preparation pass applies one 3x3 minimum filter per pixel; the directional pass then accumulates that prepared ink surface at 135deg and darkens it with an `intensity`-scaled contrast curve.
- **smudge** -- direction follows the local image structure (perpendicular to the luminance gradient, falling back to 45deg where the gradient is flat) instead of a fixed angle, and only smudges shadows (source luminance below 0.6); highlights stay untouched.

## Notes

- Marks are overlapping, softly antialiased bristled capsules. Each mark carries pigment sampled at its center and blends continuously with neighboring marks, so no rectangular cell owns an output pixel. Run length and spray jitter vary coherently across the stroke field rather than independently per pixel.
- Two-pass effect: `stkSmear` computes the directional marks (up to 24 taps per side, per field) into `_stkTmp`; `stkPost` sharpens that result and restores source alpha.
- `mode` is a compile-time selector (like `filter/oilPaint`'s `mode` and `filter/hatch`'s `mode`): each value compiles as its own shader variant.
- The widest path is Angled mode: two directional fields of up to 49 accumulation reads plus nine neighboring capsule candidates per field. Sumi-e adds one 3x3 preparation pass, then one directional field; it does not repeat the erosion kernel for every directional tap.
