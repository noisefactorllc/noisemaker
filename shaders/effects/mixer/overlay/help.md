# Overlay

Overlay blend mode. Combines multiply and screen based on the base layer. Dark base colors darken, light base colors lighten.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| tex | surface | inputTex | — | Source B texture to blend with |
| mixAmt | float | 0 | -100–100 | Blend amount (0 = original, positive = more blend) |

## Usage

```dsl
read().overlay(o1, mixAmt: 50).write(o0)
```
