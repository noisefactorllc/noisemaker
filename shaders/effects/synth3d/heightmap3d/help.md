# heightmap3d

Bake a height map and a diffuse color image into a voxel volume: for each `(x, z)` column, luminance from `heightTex` sets how tall the column is filled, and `tex` supplies the RGB stored at every occupied voxel in that column. Companion generator for `renderLandscape3d`, which raymarches the resulting volume.

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| heightTex | surface | none | - | Height source; luminance sets column height |
| tex | surface | none | - | Color source; sampled per column and stored at every occupied voxel |
| volumeSize | int | x64 | x16/x32/x64/x128 | Voxel grid resolution along each axis |
| heightScale | float | 0.35 | 0-1 | Height-map luminance multiplier before it is quantized into voxel columns |
| baseHeight | float | 0 | 0-1 | Minimum column height added before scaling, so black pixels still fill some voxels |

Height uses Rec. 709 luminance weights (0.2126 red, 0.7152 green, 0.0722 blue) applied to `heightTex`'s sampled RGB. `heightScale` and `baseHeight` combine as `clamp(luminance * heightScale + baseHeight, 0, 1) * volumeSize` voxels tall. Chain into `renderLandscape3d()` to view the result; see that effect's help for camera controls.
