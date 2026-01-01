# Polygon

Geometric shape generator.

## Description

Generates regular polygons with configurable sides, radius, rotation, and colors. Useful for creating basic geometric shapes as masks or base textures.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| sides | int | 3 | 3–64 | Number of polygon sides |
| radius | float | 0.3 | 0–1 | Radius of the shape |
| smooth | float | 0.01 | 0–1 | Edge smoothing amount |
| rotation | float | 0 | 0–6.28 | Rotation angle in radians |
| fgColor | vec3 | [1, 1, 1] | color | Foreground (shape) color |
| fgAlpha | float | 1.0 | 0–1 | Foreground opacity |
| bgColor | vec3 | [0, 0, 0] | color | Background color |
| bgAlpha | float | 1.0 | 0–1 | Background opacity |
