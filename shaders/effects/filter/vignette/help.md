## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| brightness | float | 0 | 0–1 | Center brightness adjustment |
| alpha | float | 1.0 | 0–1 | Vignette intensity |

## Usage

```dsl
read().vignette(alpha: 0.8).write(o0)
```
