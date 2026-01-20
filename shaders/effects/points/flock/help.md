# flock

2D "Boids" flocking agent simulation

## Description

Agents follow classic flocking rules:
- **Separation**: Steer to avoid crowding neighbors
- **Alignment**: Steer towards average heading of neighbors
- **Cohesion**: Steer towards average position of neighbors

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| separation | float | 2 | 0-5 | Separation |
| alignment | float | 1 | 0-5 | Alignment |
| cohesion | float | 1 | 0-5 | Cohesion |
| perceptionRadius | float | 50 | 10-200 | Perception |
| separationRadius | float | 25 | 5-100 | Separation radius |
| maxSpeed | float | 4 | 0.5-10 | Max speed |
| maxForce | float | 0.3 | 0.01-1 | Max force |
| boundaryMode | int | wrap | wrap/softWall | Boundary |
| wallMargin | float | 50 | 10-200 | Wall margin |
| noiseWeight | float | 0.1 | 0-1 | Noise |
