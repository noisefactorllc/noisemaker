# Apply Hue

Applies hue from source B to the input. Transfers the hue component while preserving saturation and lightness.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| tex | surface | inputTex | — | Source B texture to sample hue from |
| mixAmt | float | 0 | -100–100 | Blend amount (0 = original, positive = more blend) |

## Usage

```dsl
read().applyHue(o1, mixAmt: 50).write(o0)
```
