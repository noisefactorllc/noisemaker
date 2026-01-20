# Gradient

Generates smooth color gradients with multiple styles.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| type | int | linear | linear/radial/conic/fourCorners | Gradient style |
| rotation | float | 0 | 0–360 | Rotation angle in degrees |
| repeat | int | 1 | 1–4 | Number of times to repeat the gradient pattern |
| color1 | vec4 | [1, 0, 0, 1] | color | First gradient color (top-left in fourCorners mode) |
| color2 | vec4 | [1, 1, 0, 1] | color | Second gradient color (top-right in fourCorners mode) |
| color3 | vec4 | [0, 1, 0, 1] | color | Third gradient color (bottom-right in fourCorners mode) |
| color4 | vec4 | [0, 0, 1, 1] | color | Fourth gradient color (bottom-left in fourCorners mode) |

## Notes

Gradient types:
- **linear**: Smooth gradient transitioning through all 4 colors vertically
- **radial**: Circular gradient emanating from the center
- **conic**: Angular/sweep gradient rotating around the center
- **fourCorners**: Bilinear interpolation with each color at a corner
