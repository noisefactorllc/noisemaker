## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| tex | surface | none | — | Source B texture (center) |
| blendMode | int | 8 (mix) | — | Blend mode (same options as blendMode effect) |
| shape | int | 2 (square) | — | Mask shape: circle (0), diamond (1), square (2) |
| hardness | float | 0 | 0–100 | Edge hardness (0 = soft gradient, 100 = hard edge) |
| mixAmt | float | 0 | -100–100 | Mix amount (controls blend power) |

## Description

Blend from edges (source A) into center (source B) using a distance-based mask.

## Usage

```
noise().centerMask(tex: read(o1), shape: circle, hardness: 50).write(o0)
```
