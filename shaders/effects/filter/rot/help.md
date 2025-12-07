# Rotate

Rotates the image. Values from 0–1 map to 0–360 degrees.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| rotation | float | 0 | 0–1 | Rotation amount (0–1 = 0–360°) |

## Usage

```dsl
read().rot(rotation: 0.25).write(o0)
```
