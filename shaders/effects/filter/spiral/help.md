# Spiral

Applies a spiral twist distortion to the image.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| strength | float | 25 | -100–100 | Spiral twist intensity (positive = clockwise, negative = counter-clockwise) |
| speed | int | 0 | -5–5 | Animation speed for rotating spiral |
| aspectLens | boolean | true | — | When enabled, applies spiral in a circular region regardless of canvas aspect ratio |
| wrap | int | mirror | mirror/repeat/clamp | Edge wrapping mode |
| rotation | float | 0 | -180–180 | Rotation angle in degrees |
