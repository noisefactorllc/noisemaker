# render3d

Universal 3D volume raymarcher

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| volumeSize | int | v64 | v16/v32/v64/v128 | - |
| filtering | int | isosurface | isosurface/voxel | Filtering |
| surface thresh | float | 0.5 | 0-1 | Surface threshold |
| invert thresh | boolean | false | - | Invert threshold |
| orbitSpeed | int | 1 | -5-5 | Orbit speed |
| bgColor | vec3 | 0.02,0.02,0.02 | - | Background color |
| bgAlpha | float | 1 | 0-1 | Background alpha |

## Notes

- **isosurface**: Smooth raymarching with trilinear interpolation and bisection refinement
- **voxel**: DDA voxel traversal with flat face shading

The volumeSize parameter is automatically inherited from the upstream 3D effect.
