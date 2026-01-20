# Voronoi

Generates Voronoi diagram patterns.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| Diagram Type | int | — | 0–7 | Diagram mode (0=None / 1=Range / 2=Color Range / 3=Regions / 4=Color Regions / 5=Range Regions / 6=Flow / 7=Color Flow) |
| Nth Neighbor | int | — | — | Plot Nth nearest neighbor, or -Nth farthest |
| Distance Metric | int | — | 1–4 | Metric (1=Euclidean / 2=Manhattan / 3=Chebyshev / 4=Octagram) |
| SDF Sides | int | — | — | Number of sides when using SDF metrics |
| Alpha | float | — | 0–1 | Blend with original tensor |
| Refract | float | — | — | Displace the input by the voronoi field |
| Inverse | float | — | 0–1 | Invert the range-derived output |
| Ridges Hint | float | — | 0–1 | Match color weighting to ridged fractal output |
| Refract Offset | float | — | — | Offset warp sampling similar to the Python reference |
| Point Frequency | float | — | — | Voronoi point frequency |
| Generations | int | — | — | Number of point cloud generations to accumulate |
| Distribution | int | — | 0–9 | Point distribution (0=Random / 1=Square / 2=Waffle / 3=Chess / 4=Hex H / 5=Hex V / 6=Spiral / 7=Circular / 8=Concentric / 9=Rotating) |
| Point Drift | float | — | — | Jitter applied to generated point clouds |
| Include Corners | float | — | 0–1 | Clamp grid distributions to the corners |
| Downsample | float | — | 0–1 | Compute the distance field at half resolution (saves work) |
