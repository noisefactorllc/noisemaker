# adjust

Combined color adjustment — colorspace reinterpretation, hue/saturation, and brightness/contrast in one pass

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| mode | int | rgb | hsv/oklab/oklch/rgb | Colorspace mode |
| rotation | float | 0 | -180–180 | Hue rotation (degrees) |
| hueRange | float | 100 | 0–200 | Hue range |
| saturation | float | 1 | 0–4 | Saturation multiplier |
| brightness | float | 1 | 0–10 | Brightness multiplier |
| contrast | float | 0.5 | 0–1 | Contrast |
