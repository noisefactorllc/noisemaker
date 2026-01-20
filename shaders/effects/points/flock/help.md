# Flock

2D "Boids" flocking simulation with classic flocking rules.

## Description

Agents follow classic flocking rules:
- **Separation**: Steer to avoid crowding neighbors
- **Alignment**: Steer towards average heading of neighbors
- **Cohesion**: Steer towards average position of neighbors

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| separation | float | 2.0 | 0–5 | Separation force strength |
| alignment | float | 1.0 | 0–5 | Alignment force strength |
| cohesion | float | 1.0 | 0–5 | Cohesion force strength |
| perceptionRadius | float | 50 | 10–200 | Neighbor perception distance (pixels) |
| separationRadius | float | 25 | 5–100 | Minimum separation distance (pixels) |
| maxSpeed | float | 4.0 | 0.5–10 | Maximum agent speed |
| maxForce | float | 0.3 | 0.01–1 | Maximum steering force |
| boundaryMode | int | wrap | wrap/softWall | Boundary behavior |
| wallMargin | float | 50 | 10–200 | Distance from edge to start turning (pixels) |
| noiseWeight | float | 0.1 | 0–1 | Random noise/turbulence strength |

## Usage

```
pointsEmit().flock(separation: 2, alignment: 1.5, cohesion: 0.8).pointsRender().write(o0)
```
