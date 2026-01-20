# dla

Diffusion-limited aggregation

## Description

Agents perform random walks until they contact existing structure, then stick and deposit. Creates fractal, crystalline growth patterns from a central seed.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| stateSize | int | 256 | - | - |
| anchorDensity | float | 0.5 | 0.01-5 | Anchor density |
| stride | float | 15 | 1-50 | Stride |
| inputWeight | float | 15 | 0-100 | Input weight |
| decay | float | 0.25 | 0-0.5 | Decay |
| deposit | float | 17.5 | 0.5-20 | Deposit |
| attrition | float | 7.5 | 0-10 | Attrition |
| matteOpacity | float | 1 | 0-1 | Matte opacity |
