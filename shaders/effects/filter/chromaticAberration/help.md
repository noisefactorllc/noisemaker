## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| aberration | float | 50 | 0–100 | Amount of chromatic separation |
| passthru | float | 50 | 0–100 | Blend with original image |

## Usage

```dsl
read().chromaticAberration(aberration: 75).write(o0)
```
