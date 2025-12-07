# Tunnel

Perspective tunnel effect. Based on Inigo Quilez's shader technique. Creates an infinite tunnel with various shapes.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| shape | int | 0 | square, circle, diamond, star, hex | Tunnel cross-section shape |
| speed | float | 1.0 | -5–5 | Animation speed through tunnel |
| rotation | float | 0 | -2–2 | Tunnel rotation |
| scale | float | 0 | -2–2 | Tunnel scale |

## Usage

```dsl
read().tunnel(shape: "circle", speed: 0.5).write(o0)
```
