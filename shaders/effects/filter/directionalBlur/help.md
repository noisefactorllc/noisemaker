# directionalBlur

Linear motion blur along a single direction (Motion Blur)

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| angle | float | 0 | -180-180 | Direction of the blur streak, in degrees (0 = horizontal) |
| distance | float | 20 | 1-200 | Total streak span, in pixels |

## Notes

- Averages a fixed 32-tap comb evenly spaced along the blur axis, from `-distance/2` to `+distance/2` px.
- Each pixel's tap comb is shifted by a random per-pixel offset (up to half a tap step) to hide banding from the fixed tap count.
- Distinct from `filter/motionBlur`, which is a temporal frame-blending effect, not a spatial directional blur.
