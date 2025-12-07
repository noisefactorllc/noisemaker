# Apply Saturation

Applies saturation from source B to the input. Transfers the saturation component while preserving hue and lightness.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| tex | surface | inputTex | — | Source B texture to sample saturation from |
| mixAmt | float | 0 | -100–100 | Blend amount (0 = original, positive = more blend) |

## Usage

```dsl
read().applySaturation(o1, mixAmt: 50).write(o0)
```
