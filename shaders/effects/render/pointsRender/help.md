# pointsRender

Accumulate agent trails and blend with input for particle systems

## Description

Renders each agent as a single point with trail accumulation over time.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| density | float | 50 | 0-100 | Density |
| intensity | float | 75 | 0-100 | Trail intensity |
| inputIntensity | float | 10.15 | 0-100 | Input intensity |
| viewMode | int | flat | flat/ortho/perspective | View |
| rotateX | float | 0.3 | 0-6.283185 | Rotate X |
| rotateY | float | 0 | 0-6.283185 | Rotate Y |
| rotateZ | float | 0 | 0-6.283185 | Rotate Z |
| viewScale | float | 0.8 | 0.1-10 | Zoom |
| posX | float | 0 | -50-50 | Pos X |
| posY | float | 0 | -50-50 | Pos Y |
| posZ | float | 0 | -200-200 | Camera-space Z offset in perspective mode |
| fieldOfView | float | 60 | 10-150 | Vertical perspective field of view in degrees |
| matteOpacity | float | 1 | 0-1 | Background opacity |

Perspective mode uses the same camera as `pointsBillboardRender`: world coordinates, a camera at Z=80 looking down negative Z, and X/Y/Z rotations followed by camera-space offsets. `fieldOfView` controls the vertical viewing angle, `viewScale` controls zoom, and `posZ` moves through the scene. Points at or behind the near plane are clipped. Each agent remains one pixel. Flat and orthographic rendering keep their existing behavior.
