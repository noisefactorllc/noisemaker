# Step

Creates a hard edge at a threshold value. Pixels below the threshold become black, above become white.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| threshold | float | 0.5 | 0–1 | Threshold value for the step |

## Usage

```dsl
read().step(threshold: 0.5).write(o0)
```
