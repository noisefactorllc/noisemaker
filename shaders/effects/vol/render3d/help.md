## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| filtering | int | isosurface | isosurface, voxel | Rendering mode |
| threshold | float | 0.5 | 0–1 | Surface threshold for raymarching |
| invert | boolean | false | — | Invert threshold |
| orbitSpeed | int | 1 | -5–5 | Camera orbit speed |
| bgColor | vec3 | [0.02, 0.02, 0.02] | color | Background color |
| bgAlpha | float | 1.0 | 0–1 | Background alpha |

## Usage

```dsl
noise3d().render3d().write(o0)
cell3d().render3d(filtering: "voxel", threshold: 0.3).write(o0)
fractal3d().render3d(orbitSpeed: 2).write(o0)
```

## Notes

- **isosurface**: Smooth raymarching with trilinear interpolation and bisection refinement
- **voxel**: DDA voxel traversal with flat face shading

The volumeSize parameter is automatically inherited from the upstream 3D effect.
