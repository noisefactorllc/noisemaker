# Hue

Rotates the hue of the image. Values from 0–1 map to a full 360° rotation.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| amount | float | 0 | 0–1 | Hue rotation (0 = no change, 1 = full rotation) |

## Usage

```dsl
read().hue(amount: 0.5).write(o0)
```
