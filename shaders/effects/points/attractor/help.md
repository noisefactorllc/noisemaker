## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| attractor | int | 0 (lorenz) | — | Attractor type (see below) |
| speed | float | 1.0 | 0.01–2 | Simulation speed |

## Attractor Types

- **lorenz** (0): Butterfly-shaped chaotic attractor
- **rossler** (1): Spiral attractor
- **aizawa** (2): Torus-like attractor
- **thomas** (3): Cyclically symmetric attractor
- **halvorsen** (4): 3-fold symmetric attractor
- **chen** (5): Double scroll attractor
- **dadras** (6): 4-wing attractor

## Description

Strange attractors: chaotic dynamic systems visualization. Particles follow trajectories in 3D attractor space, creating complex orbital patterns.

## Usage

```
pointsEmit().attractor(attractor: lorenz, speed: 0.5).pointsRender(viewMode: ortho).write(o0)
```

Best viewed with 3D orthographic projection (`viewMode: ortho`) in pointsRender.
