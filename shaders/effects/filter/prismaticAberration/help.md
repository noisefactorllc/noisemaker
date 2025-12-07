# Prismatic Aberration

Prismatic aberration effect with hue controls. Chromatic displacement with configurable color shifting.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| aberration | float | 50 | 0–100 | Prismatic aberration amount |
| modulate | boolean | false | — | Enable hue modulation |
| hueRotate | float | 0 | 0–360 | Hue rotation in degrees |
| hueRange | float | 0 | 0–100 | Hue variation range |
| saturation | float | 0 | -100–100 | Saturation adjustment |
| passthru | float | 50 | 0–100 | Blend with original |

## Usage

```dsl
read().prismaticAberration(aberration: 75, hueRotate: 45).write(o0)
```
