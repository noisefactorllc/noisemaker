# perlin

Perlin-like noise with a periodic Z

## Description

Generates classic Perlin gradient noise with optional fractal octaves. Supports 2D and 3D dimensions with animated looping through the Z axis.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| scale | float | 25 | 0-100 | - |
| octaves | int | 1 | 1-6 | - |
| colorMode | int | rgb | mono/rgb | Color mode |
| dimensions | int | 2 | 2-3 | - |
| ridges | boolean | false | - | - |
| warpIterations | int | 0 | 0-4 | Domain warp iterations (0 = off) |
| warpScale | float | 50 | 0-100 | Warp noise frequency |
| warpIntensity | float | 50 | 0-100 | Warp displacement amount |
| seed | int | 0 | 0-100 | - |
| speed | int | 1 | 0-5 | - |

## Notes

- **Domain warp** displaces coordinates using noise before computing the main perlin noise, creating organic swirling distortion
- Higher iterations produce more complex, folded patterns
- warpScale controls the frequency of the warp noise relative to the base noise
- warpIntensity controls how far coordinates are displaced
