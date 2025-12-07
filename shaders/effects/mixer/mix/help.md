# Mix

Linear interpolation blend mode. Linearly interpolates between input and source B based on mix amount.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| tex | surface | inputTex | — | Source B texture to blend with |
| mixAmt | float | 0 | -100–100 | Blend amount (0 = original, 100 = full source B) |

## Usage

```dsl
read().mix(o1, mixAmt: 50).write(o0)
```
