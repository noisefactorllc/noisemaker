# Cloak

Cloak blend mode. Creates a transparency/cloaking effect by blending based on luminance difference.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| tex | surface | inputTex | — | Source B texture to blend with |
| mixAmt | float | 0 | -100–100 | Blend amount (0 = original, positive = more blend) |

## Usage

```dsl
read().cloak(o1, mixAmt: 50).write(o0)
```
