# distortion

Displace, reflect, and refract with two surfaces

## Description

Applies displacement, reflection, and refraction effects between two surfaces using one surface as a height/normal map to distort the other.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| tex | surface | none | - | Source B |
| mode | int | refract | displace/refract/reflect | Mode |
| mapSource | int | sourceB | sourceA/sourceB | Map source |
| intensity | float | 50 | 0-100 | Intensity |
| wrap | int | mirror | clamp/mirror/repeat | Wrap |
| smoothing | float | 1 | 1-100 | Smoothing |
| aberration | float | 0 | 0-25 | Aberration |

## Notes

- Use a noise or gradient texture as source B with "sourceB" map source to create organic distortion effects
- Reflection mode with high aberration creates prismatic rainbow effects
- Refraction mode simulates looking through glass or water
- Displacement mode creates warping effects based on color intensity
