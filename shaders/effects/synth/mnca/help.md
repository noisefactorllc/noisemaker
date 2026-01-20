# Multi-Neighborhood Cellular Automata

Multi-neighborhood cellular automata simulation.

## Description

MNCA extends classic cellular automata by using multiple neighborhood configurations with configurable thresholds and ranges. This creates more complex emergent patterns than traditional single-neighborhood rules.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| tex | surface | none | — | Texture input for seeding |
| zoom | int | x8 | x1/x2/x4/x8/x16/x32/x64 | Simulation zoom level |
| seed | float | 1 | 1–100 | Random seed for initial state |
| resetState | boolean | false | — | Reset the simulation state |
| smoothing | int | constant | constant/linear/hermite/catmullRom3x3/catmullRom4x4/bSpline3x3/bSpline4x4 | Output interpolation mode |
| speed | float | 10 | 1–100 | Simulation speed |
| weight | float | 0 | 0–100 | Input texture weight |
| n1v1 | float | 21 | 0–100 | Neighborhood 1 threshold 1 |
| n1r1 | float | 1 | 0–100 | Neighborhood 1 range 1 |
| n1v2 | float | 35 | 0–100 | Neighborhood 1 threshold 2 |
| n1r2 | float | 15 | 0–100 | Neighborhood 1 range 2 |
| n1v3 | float | 75 | 0–100 | Neighborhood 1 threshold 3 |
| n1r3 | float | 10 | 0–100 | Neighborhood 1 range 3 |
| n1v4 | float | 12 | 0–100 | Neighborhood 1 threshold 4 |
| n1r4 | float | 3 | 0–100 | Neighborhood 1 range 4 |
| n2v1 | float | 10 | 0–100 | Neighborhood 2 threshold 1 |
| n2r1 | float | 18 | 0–100 | Neighborhood 2 range 1 |
| n2v2 | float | 43 | 0–100 | Neighborhood 2 threshold 2 |
| n2r2 | float | 12 | 0–100 | Neighborhood 2 range 2 |
