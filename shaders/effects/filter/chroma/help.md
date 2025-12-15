## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| hue | float | 0.33 | 0–1 | Target hue to isolate (0–1 = full hue wheel) |
| range | float | 0.1 | 0–0.5 | Hue range to include |
| feather | float | 0.05 | 0–0.25 | Edge feathering for smooth falloff |

## Usage

```dsl
read().chroma(hue: 0.33, range: 0.1).write(o0)
```
