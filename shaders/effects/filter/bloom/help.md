## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| threshold | float | 0.8 | 0–2 | Brightness threshold for bloom extraction |
| softKnee | float | 0.2 | 0–0.5 | Soft knee for smooth threshold transition |
| intensity | float | 1.0 | 0–3 | Bloom intensity multiplier |
| radius | float | 32 | 1–128 | Blur radius for bloom spread |
| taps | int | 8 | 8–64 | Number of samples for blur quality |
| tint | vec3 | [1, 1, 1] | color | Tint color for the bloom |

## Usage

```dsl
read().bloom(intensity: 1.5, radius: 64).write(o0)
```
