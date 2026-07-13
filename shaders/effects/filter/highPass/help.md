# highPass

High-pass filter isolating edge detail as a flat mid-gray field

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| radius | float | 10 | 0.5-100 | Gaussian blur radius (px) subtracted from the source to isolate edge/detail frequencies |
| mono | boolean | false | - | Output luminance-only high-pass detail instead of per-channel color |

## Notes

- Implements High Pass filter: `out = image - gaussianBlur(image, radius) + 0.5 gray`, clamped, alpha preserved.
- Low radius keeps only fine texture/noise; high radius lets broader edge contours through.
- Taps beyond 32 are strided (`offset *= radius/32`) so the blur kernel reaches the full requested radius using a bounded number of samples.
