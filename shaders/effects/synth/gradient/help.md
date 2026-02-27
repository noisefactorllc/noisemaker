# gradient

Multi-color gradient generator with various styles

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| type | int | conic | conic/diamond/fourCorners/linear/noiseGradient/radial/spiral | Type |
| rotation | float | 0 | -180-180 | Rotation |
| repeat | int | 1 | 1-4 | Repeat |
| seed | int | 1 | 0-100 | Random seed (noise gradient only) |
| color1 | color | 1,0,0 | - | Color 1 |
| color2 | color | 1,1,0 | - | Color 2 |
| color3 | color | 0,1,0 | - | Color 3 |
| color4 | color | 0,0,1 | - | Color 4 |

## Notes

Gradient types:
- **conic**: Angular/sweep gradient rotating around the center
- **diamond**: Diamond-shaped (L1/Manhattan distance) gradient from center
- **fourCorners**: Bilinear interpolation with each color at a corner
- **linear**: Smooth gradient transitioning through all 4 colors vertically
- **noiseGradient**: Static value noise using PCG PRNG, driven by seed. Rotation rotates the noise field
- **radial**: Circular gradient emanating from the center
- **spiral**: Spiral gradient combining angle and distance
