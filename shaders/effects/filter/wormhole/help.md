# wormhole

Luminance-driven scatter displacement field

## Description

Each pixel is scattered to a new position based on its OKLab luminance. The displacement angle is determined by luminance × kink, and the distance by stride. The result is accumulated and normalized to produce a luminance-driven warp effect.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| kink | float | 1 | 0-5 | Displacement curve intensity |
| stride | float | 1 | 0-2 | Scatter distance |
| rotation | float | 0 | -180-180 | Displacement angle offset |
| wrap | int | 1 | 0-2 | Out-of-bounds handling (0=Mirror, 1=Repeat, 2=Clamp) |
| alpha | float | 1 | 0-1 | Blend with original |

## Wrap Modes

- **Mirror (0)**: Pixels that scatter beyond the edge reflect back
- **Repeat (1)**: Pixels wrap around to the opposite side (default)
- **Clamp (2)**: Pixels that scatter beyond the edge pile up at the border
