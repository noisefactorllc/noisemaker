# Apply Mode

Apply brightness, hue, or saturation from source B to source A.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| tex | surface | none | — | Source B texture to apply values from |
| mode | int | brightness | brightness/hue/saturation | Mode to apply |
| mixAmt | float | 0 | -100–100 | Mix amount (0 = original, positive = more blend) |

## Usage

```
noise().applyMode(tex: read(o1), mode: hue, mixAmt: 50).write(o0)
```
