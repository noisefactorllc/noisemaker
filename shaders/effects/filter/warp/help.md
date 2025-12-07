# Warp

Perlin noise-based warp distortion. Direct port of nd.warp's Perlin mode. Distorts the image using animated noise.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| strength | float | 25 | 0–100 | Warp distortion strength |
| scale | float | 1.0 | 0.1–5 | Noise scale |
| seed | int | 1 | 1–100 | Random seed for noise |
| speed | float | 0 | 0–2 | Animation speed |

## Usage

```dsl
read().warp(strength: 50, speed: 0.5).write(o0)
```
