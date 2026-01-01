## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| tex | surface | none | — | Source B texture to apply values from |
| mode | int | 0 (brightness) | — | Mode: brightness (0), hue (1), saturation (2) |
| mixAmt | float | 0 | -100–100 | Mix amount (0 = original, positive = more blend) |

## Description

Apply brightness, hue, or saturation from source B to source A.

## Usage

```
noise().applyMode(tex: read(o1), mode: hue, mixAmt: 50).write(o0)
```
