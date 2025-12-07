# Noise3D

3D simplex noise volume generator. Creates smooth 3D noise volumes with optional ridged mode and octave layering.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| volumeSize | int | x64 | x16, x32, x64, x128 | Volume resolution |
| scale | float | 3 | 0–100 | Noise scale |
| octaves | int | 1 | 1–6 | Number of octaves |
| colorMode | int | mono | mono, rgb | Color mode |
| ridges | boolean | false | — | Enable ridged noise |
| seed | float | 0 | 0–100 | Random seed |

## Usage

```dsl
noise3d(scale: 5, octaves: 3).render3d().write(o0)
noise3d(ridges: true).cell3d().render3d().write(o0)  // chain effects
```
