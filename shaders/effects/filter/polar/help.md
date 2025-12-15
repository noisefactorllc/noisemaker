## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| mode | int | 0 | polar, vortex | Transformation mode |
| speed | float | 0 | -2–2 | Animation speed |
| rotation | float | 0 | -2–2 | Rotation amount |
| scale | float | 0 | -2–2 | Scale factor |

## Usage

```dsl
read().polar(mode: "vortex", speed: 0.5).write(o0)
```
