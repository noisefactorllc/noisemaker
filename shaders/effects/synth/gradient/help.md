# gradient

Multi-color gradient generator with various styles

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| type | int | fourCorners | linear/radial/conic/fourCorners | Type |
| rotation | float | 0 | -180-180 | Rotation |
| repeat | int | 1 | 1-4 | Repeat |
| color1 | vec4 | 1,0,0,1 | - | Color 1 |
| color2 | vec4 | 1,1,0,1 | - | Color 2 |
| color3 | vec4 | 0,1,0,1 | - | Color 3 |
| color4 | vec4 | 0,0,1,1 | - | Color 4 |

## Notes

Gradient types:
- **linear**: Smooth gradient transitioning through all 4 colors vertically
- **radial**: Circular gradient emanating from the center
- **conic**: Angular/sweep gradient rotating around the center
- **fourCorners**: Bilinear interpolation with each color at a corner
