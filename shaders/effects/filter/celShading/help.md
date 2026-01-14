# Cel Shading Effect

Applies cartoon/anime-style cel shading to 2D textures using a multi-pass approach for high-quality results.

## How It Works

1. **Color Pass**: Applies quantized diffuse lighting and posterizes colors into discrete bands
2. **Edge Pass**: Performs Sobel edge detection on the quantized colors for clean outlines
3. **Blend Pass**: Combines the cel-shaded colors with edge outlines and mixes with the original image

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| levels | int | 4 | 2-8 | Number of color quantization levels |
| edgeWidth | float | 1.0 | 0.5-5 | Thickness of edge outlines (in pixels) |
| edgeThreshold | float | 0.15 | 0.01-1 | Edge detection sensitivity threshold |
| edgeColor | vec3 | [0,0,0] | — | Color of edge outlines |
| lightDirection | vec3 | [0.5,0.5,1] | — | Direction of the diffuse light |
| shadingStrength | float | 0.5 | 0-1 | Intensity of light-based shading |
| mix | float | 1.0 | 0-1 | Mix between processed and original image |

## Usage Tips

- **Anime Style**: Use 3-4 levels with moderate edge width (~1.5)
- **Comic Book**: Use 2-3 levels with thick edges (3-4) and high shading strength
- **Adjust Edges**: Lower edgeThreshold to detect more edges, increase edgeWidth for bolder outlines
- **Subtle Effect**: Reduce mix to blend the cel-shaded look with the original image
