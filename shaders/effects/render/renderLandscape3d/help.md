# renderLandscape3d

Raymarch a voxel volume (from `heightmap3d`, or any other volume/geometry generator) as a lit landscape, in either a fixed isometric view or a movable perspective camera. Each hit voxel is shaded from its face normal and the light direction; the background shows through where the ray never hits geometry.

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| volumeSize | int | 64 | - | Voxel grid resolution; inherited from the upstream 3D generator |
| threshold | float | 0.5 | 0-1 | Density cutoff below which a voxel is treated as empty |
| densitySource | int | geometry | geometry | Reserved; occupancy always comes from the volume's geometry buffer |
| zoom | float | 1 | 0.25-4 | Camera zoom, shared between isometric and perspective view |
| panX | float | 0 | -1-1 | Horizontal pan |
| panY | float | 0 | -1-1 | Vertical pan |
| lightDirection | vec3 | -0.4, 0.85, 0.6 | -1-1 | Direction toward the light source |
| ambient | float | 0.35 | 0-1 | Ambient light applied to every voxel regardless of orientation |
| diffuseIntensity | float | 0.85 | 0-2 | Lambertian shading strength from the face normal and light direction |
| specularIntensity | float | 0.12 | 0-1 | Specular highlight strength |
| bgColor | color | 0.025, 0.045, 0.075 | - | Color shown where the ray misses all geometry |
| bgAlpha | float | 1 | 0-1 | Background opacity |
| viewMode | int | ortho | ortho/perspective | Isometric orthographic camera, or a movable perspective camera |
| rotateX | float | 0.3 | 0-6.283185 | Perspective camera rotation around X (perspective mode only) |
| rotateY | float | 0 | 0-6.283185 | Perspective camera rotation around Y (perspective mode only) |
| rotateZ | float | 0 | 0-6.283185 | Perspective camera rotation around Z (perspective mode only) |
| viewScale | float | 0.8 | 0.1-10 | Perspective camera scale; the isometric view uses `zoom` instead |
| posX | float | 0 | -50-50 | Perspective camera position X (perspective mode only) |
| posY | float | 0 | -50-50 | Perspective camera position Y (perspective mode only) |
| posZ | float | 0 | -200-200 | Perspective camera position Z (perspective mode only) |
| fieldOfView | float | 60 | 10-150 | Perspective camera field of view in degrees (perspective mode only) |

The perspective camera shares its projection with `pointsRender`/`pointsBillboardRender`'s own `viewMode: perspective`, so a landscape and a particle system can be composited from the same virtual camera. `threshold` and `volumeSize` normally come from the upstream generator (e.g. `heightmap3d`) and rarely need overriding by hand.
