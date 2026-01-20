# DLA (Diffusion-Limited Aggregation)

Diffusion-Limited Aggregation creates fractal, crystalline growth patterns.

## Description

Agents perform random walks until they contact existing structure, then stick and deposit. Creates fractal, crystalline growth patterns from a central seed.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| anchorDensity | float | 0.5 | 0.01–5 | Density of initial anchor seeds in center |
| stride | float | 15 | 1–50 | Agent movement distance per step |
| inputWeight | float | 15 | 0–100 | Weight of input texture influence |
| decay | float | 0.25 | 0–0.5 | Anchor grid decay rate |
| deposit | float | 17.5 | 0.5–20 | Amount deposited when agent sticks |
| attrition | float | 7.5 | 0–10 | Per-frame respawn chance for stuck agents |

## Usage

```
pointsEmit().dla(anchorDensity: 1, deposit: 10).pointsRender().write(o0)
```
