# Lighten

Lighten blend mode. Takes the maximum of each channel from input and source B, resulting in a lighter image.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| tex | surface | inputTex | — | Source B texture to blend with |
| mixAmt | float | 0 | -100–100 | Blend amount (0 = original, positive = more blend) |

## Usage

```dsl
read().lighten(o1, mixAmt: 50).write(o0)
```
