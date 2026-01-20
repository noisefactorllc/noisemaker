# Center Mask

Blend from edges (source A) into center (source B) using a distance-based mask.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| tex | surface | none | — | Source B texture (center) |
| blendMode | int | mix | (same options as blendMode effect) | Blend mode |
| shape | int | square | circle/diamond/square | Mask shape |
| hardness | float | 0 | 0–100 | Edge hardness (0 = soft gradient, 100 = hard edge) |
| mixAmt | float | 0 | -100–100 | Mix amount (controls blend power) |

## Usage

```
noise().centerMask(tex: read(o1), shape: circle, hardness: 50).write(o0)
```
