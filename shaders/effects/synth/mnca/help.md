# mnca

Multi-neighborhood cellular automata

## Description

MNCA extends classic cellular automata by using multiple neighborhood configurations with configurable thresholds and ranges. This creates more complex emergent patterns than traditional single-neighborhood rules.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| tex | surface | none | - | Texture |
| zoom | int | x8 | x1/x2/x4/x8/x16/x32/x64 | Zoom |
| seed | float | 1 | 1-100 | Seed |
| smoothing | int | constant | constant/linear/hermite/catmullRom3x3/catmullRom4x4/bSpline3x3/bSpline4x4 | Smoothing |
| speed | float | 10 | 1-100 | Speed |
| resetState | boolean | false | - | State |
| weight | float | 0 | 0-100 | Input weight |
| n1v1 | float | 21 | 0-100 | N1 thresh 1 |
| n1r1 | float | 1 | 0-100 | N1 range 1 |
| n1v2 | float | 35 | 0-100 | N1 thresh 2 |
| n1r2 | float | 15 | 0-100 | N1 range 2 |
| n1v3 | float | 75 | 0-100 | N1 thresh 3 |
| n1r3 | float | 10 | 0-100 | N1 range 3 |
| n1v4 | float | 12 | 0-100 | N1 thresh 4 |
| n1r4 | float | 3 | 0-100 | N1 range 4 |
| n2v1 | float | 10 | 0-100 | N2 thresh 1 |
| n2r1 | float | 18 | 0-100 | N2 range 1 |
| n2v2 | float | 43 | 0-100 | N2 thresh 2 |
| n2r2 | float | 12 | 0-100 | N2 range 2 |
| source | int | 0 | 0-7 | - |
