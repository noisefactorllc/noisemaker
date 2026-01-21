# celShading

Cartoon-style shading with posterization and outlines

## Description

Uses a three-pass approach:
1. **Color Pass**: Applies quantized diffuse lighting and posterizes colors into discrete bands
2. **Edge Pass**: Performs Sobel edge detection on the quantized colors for clean outlines
3. **Blend Pass**: Combines the cel-shaded colors with edge outlines and mixes with the original image

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| levels | int | 4 | 2-8 | Levels |
| edgeWidth | int | 1 | 0-5 | Width |
| edgeThreshold | float | 0.15 | 0.01-1 | Threshold |
| edgeColor | color | 0,0,0 | - | Color |
| lightDirection | vec3 | 0.5,0.5,1 | - | Light Direction |
| shadingStrength | float | 0 | 0-1 | Shading Strength |
| mix | float | 1 | 0-1 | Mix |

## Notes

- **Anime Style**: Use 3-4 levels with moderate edge width (~1.5)
- **Comic Book**: Use 2-3 levels with thick edges (3-4) and high shading strength
- **Adjust Edges**: Lower edgeThreshold to detect more edges, increase edgeWidth for bolder outlines
- **Subtle Effect**: Reduce mix to blend the cel-shaded look with the original image
