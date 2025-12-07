# Apply Brightness

Applies brightness from source B to the input. Uses the luminance of source B to modulate the brightness of the input.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| tex | surface | inputTex | — | Source B texture to sample brightness from |
| mixAmt | float | 0 | -100–100 | Blend amount (0 = original, positive = more blend) |

## Usage

```dsl
read().applyBrightness(o1, mixAmt: 50).write(o0)
```
