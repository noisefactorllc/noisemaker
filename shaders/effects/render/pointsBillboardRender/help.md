## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| tex | surface | none | — | Sprite texture to render for each particle |
| pointSize | float | 8.0 | 1–64 | Base point size in pixels |
| sizeVariation | float | 0 | 0–100 | Point size variation (0 = uniform) |
| rotationVariation | float | 0 | 0–100 | Rotation variation (0 = no rotation, 100 = full 360°) |
| seed | float | 42 | 0–1000 | Random seed for deterministic noise |
| density | float | 50 | 0–100 | Percentage of agents to render |
| intensity | float | 75 | 0–100 | Trail persistence (0 = instant fade, 100 = no decay) |
| inputIntensity | float | 10.15 | 0–100 | Input blend factor (0 = trail only, 100 = full input) |
| viewMode | int | 0 (flat) | — | View mode: flat (0), ortho (1) |
| rotateX | float | 0.3 | 0–2π | 3D rotation around X axis (radians) |
| rotateY | float | 0 | 0–2π | 3D rotation around Y axis (radians) |
| rotateZ | float | 0 | 0–2π | 3D rotation around Z axis (radians) |
| viewScale | float | 0.8 | 0.1–10 | Zoom/scale factor |
| posX | float | 0 | -50–50 | Position offset X |
| posY | float | 0 | -50–50 | Position offset Y |

## Description

Render agent particles as billboard sprites with texture sampling. Each particle is rendered as a textured quad that can be sized, rotated, and varied.

## Usage

```
pointsEmit().flow().pointsBillboardRender(tex: read(o1), pointSize: 16).write(o0)
```
