## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| typeCount | int | 6 | 2–8 | Number of particle types |
| attractionScale | float | 1.0 | 0–5 | Global attraction force multiplier |
| repulsionScale | float | 1.0 | 0–5 | Global repulsion force multiplier |
| minRadius | float | 0.01 | 0.001–0.05 | Minimum interaction radius (normalized) |
| maxRadius | float | 0.08 | 0.02–0.2 | Maximum interaction radius (normalized) |
| maxSpeed | float | 0.003 | 0.0005–0.01 | Maximum particle speed |
| friction | float | 0.1 | 0–1 | Velocity friction/damping |
| boundaryMode | int | 0 (wrap) | — | Boundary: wrap (0), bounce (1) |
| matrixSeed | float | 42 | 0–1000 | Random seed for force matrix generation |
| symmetricForces | boolean | false | — | Make force matrix symmetric (A→B = B→A) |
| useTypeColor | boolean | false | — | Show type colors instead of sampled colors |

## Description

Type-based attraction/repulsion particle simulation (Particle Life). Each particle has a type, and type pairs have randomly generated attraction/repulsion forces. Creates emergent self-organizing structures and behaviors.

## Usage

```
pointsEmit().life(typeCount: 4, matrixSeed: 123).pointsRender().write(o0)
```

Use `useTypeColor: true` to visualize particle types with distinct colors.
