# attractor

Strange attractors: chaotic dynamic systems visualization

## Description

Particles follow trajectories in 3D attractor space, creating complex orbital patterns. Best viewed with 3D orthographic projection (`viewMode: ortho`) in pointsRender.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| diffuseTex | surface | none | - | Particle color map; none preserves the existing particle color |
| stateSize | int | 256 | - | - |
| attractor | int | lorenz | lorenz/rossler/aizawa/thomas/halvorsen/chen/dadras | Attractor |
| speed | float | 1 | 0.01-2 | Speed |
| viewMode | int | 1 | - | - |
