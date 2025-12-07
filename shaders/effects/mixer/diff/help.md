# Difference

Difference blend mode. Computes the absolute difference between input and source B, creating high contrast where colors differ.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| tex | surface | inputTex | — | Source B texture to blend with |
| mixAmt | float | 0 | -100–100 | Blend amount (0 = original, positive = more blend) |

## Usage

```dsl
read().diff(o1, mixAmt: 50).write(o0)
```
