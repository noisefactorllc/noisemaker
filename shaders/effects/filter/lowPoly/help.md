# lowPoly

Low-polygon style render using Voronoi cells

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| scale | int | 50 | 2-100 | Cell size |
| seed | int | 1 | 1-100 | Random seed for cell layout |
| mode | int | 1 | 0-3 | Rendering mode (0=Flat, 1=Edges, 2=Distance2, 3=Distance3) |
| edgeStrength | float | 0.15 | 0-1 | Strength of edge/distance effect |
| edgeColor | color | 0,0,0 | - | Edge color (edges mode only) |
| alpha | float | 1.0 | 0-1 | Blend with original input |
| speed | int | 0 | 0-5 | Animation speed (0=static) |

## Modes

- **Flat (0)**: Pure solid cell color, no edges
- **Edges (1)**: Solid cell color with darkened edges toward edge color
- **Distance2 (2)**: 2nd-nearest Voronoi distance multiplied with cell color — shows cell edge structure
- **Distance3 (3)**: 3rd-nearest Voronoi distance multiplied with cell color — shows ridge/intersection patterns

## Animation

Seed points drift in per-cell circular paths that loop seamlessly. Each cell has a unique phase and radius so the motion looks organic rather than uniform.
