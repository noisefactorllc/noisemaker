## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
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

Accumulate agent trails and blend with input for particle systems. Renders each agent as a single point with trail accumulation over time.

## Usage

```
pointsEmit().flow().pointsRender(intensity: 90, density: 75).write(o0)
```

For 3D visualization:
```
pointsEmit().attractor().pointsRender(viewMode: ortho, rotateX: 0.5).write(o0)
```
