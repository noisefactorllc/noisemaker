# Chromatic Aberration

Simulates lens chromatic aberration by separating and offsetting color channels, creating color fringing at edges.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| aberration | float | 50 | 0–100 | Amount of chromatic separation |
| passthru | float | 50 | 0–100 | Blend with original image |

## Usage

```dsl
read().chromaticAberration(aberration: 75).write(o0)
```
