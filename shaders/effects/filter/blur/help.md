## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| radiusX | float | 5.0 | 0–50 | Horizontal blur radius |
| radiusY | float | 5.0 | 0–50 | Vertical blur radius |

## Usage

```dsl
read().blur(radiusX: 10, radiusY: 10).write(o0)
```
