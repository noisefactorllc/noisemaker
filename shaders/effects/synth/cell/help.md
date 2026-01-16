# Cellular Noise

Cellular/Voronoi noise with distance metrics.

## Description

Generates cellular noise patterns based on Voronoi distance calculations. Supports multiple distance metrics for different cell shapes.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| shape | int | circle | circle, diamond, hexagon, octagon, square, triangle | Distance metric for cell calculation |
| scale | float | 75 | 1–100 | Noise scale |
| cellScale | float | 87 | 1–100 | Cell size scale |
| cellSmooth | float | 11 | 0–100 | Cell edge smoothing |
| cellVariation | float | 50 | 0–100 | Cell shape variation |
| loopAmp | int | 1 | 0–5 | Animation speed |
| seed | int | 1 | 1–100 | Random seed |
