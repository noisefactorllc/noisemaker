# Distortion

Displacement, reflection, and refraction effects between two surfaces.

## Description

Applies displacement, reflection, and refraction effects between two surfaces using one surface as a height/normal map to distort the other.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| tex | surface | none | — | Source B input surface |
| mode | int | displace | displace/refract/reflect | Distortion type |
| mapSource | int | sourceA | sourceA/sourceB | Which surface to use as the distortion map |
| intensity | float | — | — | Strength of the distortion effect |
| wrap | int | mirror | mirror/repeat/clamp | How to handle coordinates outside texture bounds |
| smoothing | float | — | — | Smoothness of calculated normals (higher = smoother) |
| aberration | float | — | — | Chromatic aberration intensity for reflection mode |

## Notes

- Use a noise or gradient texture as source B with "sourceB" map source to create organic distortion effects
- Reflection mode with high aberration creates prismatic rainbow effects
- Refraction mode simulates looking through glass or water
- Displacement mode creates warping effects based on color intensity
