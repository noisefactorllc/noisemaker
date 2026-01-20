# Perlin Noise

Perlin-like noise with a periodic Z.

## Description

Generates classic Perlin gradient noise with optional fractal octaves. Supports 2D and 3D dimensions with animated looping through the Z axis.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| scale | float | 25 | 0–100 | Noise scale |
| octaves | int | 1 | 1–6 | Number of octaves for fractal layering |
| colorMode | int | rgb | mono/rgb | Output color mode |
| dimensions | int | 2 | 2–3 | Noise dimensions (2D or 3D) |
| ridges | boolean | false | — | Enable ridged noise |
| seed | float | 0 | 0–100 | Random seed |
