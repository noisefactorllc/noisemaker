# Subtract

Subtract blend mode. Subtracts source B from input, darkening the result. Values are clamped to prevent underflow.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| tex | surface | inputTex | — | Source B texture to subtract |
| mixAmt | float | 0 | -100–100 | Blend amount (0 = original, positive = more blend) |

## Usage

```dsl
read().subtract(o1, mixAmt: 50).write(o0)
```
