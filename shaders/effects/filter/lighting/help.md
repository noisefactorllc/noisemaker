# Lighting

Applies 3D lighting to 2D textures by calculating surface normals from luminosity.

## Description

Uses a three-step process:
1. **Normal Calculation**: Uses Sobel convolution on the input texture's luminosity to extract gradients, which are converted into 3D surface normals
2. **Lighting Model**: Applies Blinn-Phong lighting with diffuse, specular, and ambient components
3. **Output**: The lit result is combined with the original texture colors

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| normalStrength | float | 1.5 | 0–5 | Controls the prominence of surface details (depth) |
| diffuseColor | vec3 | [1, 1, 1] | — | Color of the diffuse lighting component |
| specularColor | vec3 | [1, 1, 1] | — | Color of the specular highlights |
| specularIntensity | float | 0.5 | 0–2 | Strength of specular highlights |
| shininess | float | 64 | 8–256 | Controls highlight sharpness (higher = tighter highlights) |
| ambientColor | vec3 | [0.2, 0.2, 0.2] | — | Base ambient lighting color |
| lightDirection | vec3 | [0.5, 0.5, 1] | — | Direction vector of the light source (X, Y, Z) |
| reflection | float | 0 | 0–100 | Amount of reflection distortion |
| refraction | float | 0 | 0–100 | Amount of refraction distortion |
| aberration | float | 0 | 0–100 | Chromatic aberration amount |

## Notes

- Increase **normalStrength** to make surface features more pronounced
- Adjust **lightDirection** to change where highlights appear
- Higher **shininess** creates tighter, shinier specular highlights
- Use **reflection** and **refraction** for glass/water-like effects
- **aberration** adds RGB channel splitting for dispersion effects
