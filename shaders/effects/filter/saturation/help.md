# Saturation

Simple saturation adjustment. Multiplies the saturation by the specified amount.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| amount | float | 1.0 | 0–4 | Saturation multiplier (1.0 = no change) |

## Usage

```dsl
read().saturation(amount: 1.5).write(o0)
```
