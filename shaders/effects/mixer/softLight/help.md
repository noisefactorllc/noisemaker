# Soft Light

Soft light blend mode. A gentler version of overlay. Creates subtle lighting effects without harsh contrast.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| tex | surface | inputTex | — | Source B texture to blend with |
| mixAmt | float | 0 | -100–100 | Blend amount (0 = original, positive = more blend) |

## Usage

```dsl
read().softLight(o1, mixAmt: 50).write(o0)
```
