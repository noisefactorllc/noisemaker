# Exclusion

Exclusion blend mode. Similar to difference but with lower contrast. Creates a softer inversion effect.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| tex | surface | inputTex | — | Source B texture to blend with |
| mixAmt | float | 0 | -100–100 | Blend amount (0 = original, positive = more blend) |

## Usage

```dsl
read().exclusion(o1, mixAmt: 50).write(o0)
```
