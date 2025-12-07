# Dodge

Color dodge blend mode. Lightens the input by decreasing contrast based on source B. Creates bright, washed-out highlights.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| tex | surface | inputTex | — | Source B texture to blend with |
| mixAmt | float | 0 | -100–100 | Blend amount (0 = original, positive = more blend) |

## Usage

```dsl
read().dodge(o1, mixAmt: 50).write(o0)
```
