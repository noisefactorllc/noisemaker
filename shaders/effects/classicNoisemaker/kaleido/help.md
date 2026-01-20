# Kaleido

Creates a kaleidoscope mirror effect.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| Sides | int | — | — | Number of kaleidoscope wedges |
| SDF Sides | int | — | 0–— | Polygon sides for SDF distance metric (0–2 uses Euclidean) |
| Blend Edges | float | — | 0–1 | Fade to original image at edges |
| Point Frequency | float | — | — | Number of Voronoi points per axis |
| Generations | int | — | — | Voronoi point cloud generations to accumulate |
| Distribution | int | — | — | Voronoi point distribution pattern |
| Point Drift | float | — | — | Random drift applied to Voronoi points |
| Include Corners | float | — | 0–1 | Include corner points for grid distributions |
