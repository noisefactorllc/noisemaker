# Hydraulic

Hydraulic erosion flow simulation using gradient descent.

## Description

Agents flow downhill following the steepest descent of the input texture brightness, simulating water flowing over terrain. Use `inverse: true` for uphill flow (gradient ascent).

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| stride | float | 10 | 1–1000 | Movement distance per step |
| quantize | boolean | false | — | Quantize movement to 8 directions |
| inverse | boolean | false | — | Invert gradient direction (climb instead of descend) |
| inputWeight | float | 100 | 0–100 | Weight of input texture influence |

## Usage

```
noise().pointsEmit().hydraulic(stride: 15).pointsRender().write(o0)
```
