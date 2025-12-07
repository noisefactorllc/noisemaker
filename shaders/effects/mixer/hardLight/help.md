# Hard Light

Hard light blend mode. Combines multiply and screen based on the blend layer. Dark blend colors darken (multiply), light blend colors lighten (screen).

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| tex | surface | inputTex | — | Source B texture to blend with |
| mixAmt | float | 0 | -100–100 | Blend amount (0 = original, positive = more blend) |

## Usage

```dsl
read().hardLight(o1, mixAmt: 50).write(o0)
```
