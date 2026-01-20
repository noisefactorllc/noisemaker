# life

Type-based attraction/repulsion particle simulation

## Description

Each particle has a type, and type pairs have randomly generated attraction/repulsion forces. Creates emergent self-organizing structures and behaviors.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| stateSize | int | 256 | - | - |
| typeCount | int | 6 | 2-8 | Types |
| attractionScale | float | 1 | 0-5 | Attraction |
| repulsionScale | float | 1 | 0-5 | Repulsion |
| minRadius | float | 0.01 | 0.001-0.05 | Min radius |
| maxRadius | float | 0.08 | 0.02-0.2 | Max radius |
| maxSpeed | float | 0.003 | 0.0005-0.01 | Max speed |
| friction | float | 0.1 | 0-1 | Friction |
| boundaryMode | int | wrap | wrap/bounce | Boundary |
| matrixSeed | float | 42 | 0-1000 | Matrix seed |
| symmetricForces | boolean | false | - | Symmetric |
| useTypeColor | boolean | false | - | Show types |
