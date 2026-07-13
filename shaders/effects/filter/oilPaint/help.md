# oilPaint

Painterly filter with facet, daubs, dry-brush, fresco, palette-knife, and sponge modes over a shared sector-Kuwahara flattening core.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| mode | int | daubs | facet/daubs/dryBrush/fresco/knife/sponge | Painterly style |
| size | float | 6 | 1-12 | Kuwahara sector radius (px); controls dab/patch scale |
| detail | float | 50 | 0-100 | Per-mode strength; inactive in facet mode |
| texture | float | 20 | 0-100 | Granulation noise mixed into the result |
| seed | int | 1 | 1-100 | Sponge banding variation; enabled only in sponge mode |

## Modes

- **facet** -- passthrough of the flattened sector-Kuwahara result, using a tighter radius (`min(size, 3)`) for small flat polygon facets rather than large brush strokes.
- **daubs** (default) -- unsharp-sharpens the flattened patches so their boundaries read as crisp brush dabs; `detail` sets the sharpen strength.
- **dryBrush** -- posterizes the flattened color to `round(mix(8, 3, detail / 100))` levels with a slight edge darken, mimicking scrubby dry-brush patches.
- **fresco** -- darkens edges by up to 60% of `detail`, scaled by local gradient magnitude, then applies a contrast S-curve for a punchy, dark-edged look.
- **knife** -- mixes the flattened result with a 3x3 tent blur by `detail`, softening patch boundaries into flat palette-knife strokes.
- **sponge** -- modulates brightness in blotchy bands driven by fbm noise (seeded by `seed`, scaled by `size`), darkening and lightening by up to `detail / 100 * 0.25`.

All modes finish with a granulation pass that mixes in a subtle brightness-modulating noise texture, scaled by `texture`.

## Notes

- Two-pass effect: `oilFlatten` computes an 8-sector Kuwahara filter (radius = `size`, or `min(size, 3)` for facet) into an internal texture; `oilPost` reshapes that flattened result per `mode` and applies granulation.
- `mode` is a compile-time selector: each value compiles as its own shader variant.
- Flagged for performance: the Kuwahara pass is a bounded but wide neighborhood sum (up to 625 taps per pixel at `size` = 12).
