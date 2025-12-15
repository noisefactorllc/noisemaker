## Parameters

- **Diagram Type**: 0=None (passthrough), 1=Range, 2=Color Range, 3=Regions, 4=Color Regions, 5=Range Regions, 6=Flow, 7=Color Flow.
- **Nth Neighbor**: Plot Nth nearest neighbor, or -Nth farthest.
- **Distance Metric**: 1=Euclidean, 2=Manhattan, 3=Chebyshev, 4=Octagram.
- **SDF Sides**: Number of sides when using SDF metrics.
- **Alpha**: Blend with original tensor.
- **Refract**: Displace the input by the voronoi field.
- **Inverse**: Invert the range-derived output.
- **Ridges Hint**: Match color weighting to ridged fractal output.
- **Refract Offset**: Offset warp sampling similar to the Python reference.
- **Point Frequency**: Voronoi point frequency.
- **Generations**: Number of point cloud generations to accumulate.
- **Distribution**: 0=Random, 1=Square, 2=Waffle, 3=Chess, 4=Hex (H), 5=Hex (V), 6=Spiral, 7=Circular, 8=Concentric, 9=Rotating.
- **Point Drift**: Jitter applied to generated point clouds.
- **Include Corners**: Clamp grid distributions to the corners.
- **Downsample**: Compute the distance field at half resolution (saves work).
