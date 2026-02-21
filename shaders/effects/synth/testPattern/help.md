# testPattern

Configurable test patterns for debugging and calibration

## Description

Generates various test patterns useful for debugging coordinate systems, verifying color output, and calibrating displays.

## Patterns

| Pattern | Description |
|---------|-------------|
| checkerboard | NxN numbered checkerboard for identifying axis flips |
| colorBars | 8 vertical SMPTE-style color bars |
| gradient | Horizontal black-to-white gradient ramp |
| uvMap | UV coordinate visualization (R=u, G=v, B=0) |
| gridLines | Thin anti-aliased white lines at grid cell boundaries |
| colorGrid | Each cell colored with a unique hue (golden-ratio distributed) |
| dotGrid | White filled circles at grid intersection points |

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| pattern | int | 0 | 0-6 | Pattern selection (see table above) |
| gridSize | int | 4 | 1-16 | Grid size (used by checkerboard, gridLines, colorGrid, dotGrid) |
