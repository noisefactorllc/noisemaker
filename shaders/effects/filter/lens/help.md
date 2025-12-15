## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| displacement | float | 0 | -1–1 | Distortion amount (negative = barrel, positive = pincushion) |

## Usage

```dsl
read().lens(displacement: 0.5).write(o0)
```
