# polygon

Geometric shape generator

## Description

Generates regular polygons with configurable sides, radius, rotation, and colors. Useful for creating basic geometric shapes as masks or base textures.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| sides | int | 3 | 3-64 | Sides |
| radius | float | 0.5 | 0-1 | Size |
| smooth | float | 0.01 | 0-1 | Edge smoothness |
| rotation | float | 0 | -180-180 | Rotation |
| fgColor | vec3 | 1,1,1 | - | Foreground Color |
| fgAlpha | float | 1 | 0-1 | Foreground Opacity |
| bgColor | vec3 | 0,0,0 | - | Background Color |
| bgAlpha | float | 1 | 0-1 | Background Opacity |
