# Noise

Simplex noise generator with octave layering. Creates smooth, organic noise patterns with optional ridged mode.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| scale | float | 25 | 0–100 | Noise scale |
| octaves | int | 1 | 1–6 | Number of octaves for fractal layering |
| colorMode | int | rgb | mono, rgb | Output color mode |
| ridges | boolean | false | — | Enable ridged noise |
| seed | float | 0 | 0–100 | Random seed |

## Usage

```dsl
noise(scale: 50, octaves: 3, ridges: true).write(o0)
```
