# colorReplace

Color replacement with alpha output. Matches pixels near `targetColor` by RGB distance, then independently remaps RGB and alpha based on match strength.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| targetColor | color | 0,0,0 | - | Color to find in the input |
| replaceColor | color | 1,1,1 | - | Color matched pixels are blended toward |
| sensitivity | float | 0.3 | 0-1 | Match tolerance (higher = broader match) |
| smoothing | float | 0.1 | 0-1 | Width of the soft falloff edge |
| colorMix | float | 1.0 | 0-1 | How much of replaceColor to blend in at matched pixels |
| replaceAlpha | float | 1.0 | 0-1 | Alpha multiplier for matched pixels |
| keepAlpha | float | 1.0 | 0-1 | Alpha multiplier for unmatched pixels |

## Notes

- Match strength is `1 - smoothstep(sensitivity - smoothing/2, sensitivity + smoothing/2, dist)` where `dist` is normalized euclidean RGB distance.
- Output alpha is the input alpha multiplied by the per-pixel blend between `keepAlpha` and `replaceAlpha`. Existing transparency is preserved.

## Common recipes

- **Replace black with red** — `targetColor: #000000, replaceColor: #ff0000, colorMix: 1, replaceAlpha: 1, keepAlpha: 1`
- **Key out black (cut it out)** — `targetColor: #000000, colorMix: 0, replaceAlpha: 0, keepAlpha: 1`
- **Isolate green (keep only matches)** — `targetColor: #00ff00, colorMix: 0, replaceAlpha: 1, keepAlpha: 0`
- **Luminance to alpha** (black = transparent, white = opaque, RGB unchanged) — `targetColor: #000000, sensitivity: 0.5, smoothing: 1, colorMix: 0, replaceAlpha: 0, keepAlpha: 1`
