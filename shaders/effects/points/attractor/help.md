# Attractor

Strange attractors: chaotic dynamic systems visualization.

## Description

Particles follow trajectories in 3D attractor space, creating complex orbital patterns. Best viewed with 3D orthographic projection (`viewMode: ortho`) in pointsRender.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| attractor | int | lorenz | lorenz/rossler/aizawa/thomas/halvorsen/chen/dadras | Attractor type |
| speed | float | 1.0 | 0.01–2 | Simulation speed |

## Attractor Types

- **lorenz**: Butterfly-shaped chaotic attractor
- **rossler**: Spiral attractor
- **aizawa**: Torus-like attractor
- **thomas**: Cyclically symmetric attractor
- **halvorsen**: 3-fold symmetric attractor
- **chen**: Double scroll attractor
- **dadras**: 4-wing attractor

## Usage

```
pointsEmit().attractor(attractor: lorenz, speed: 0.5).pointsRender(viewMode: ortho).write(o0)
```
