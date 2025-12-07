# Brightness

Simple brightness adjustment. Multiplies pixel values by the specified amount.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| amount | float | 1.0 | 0–10 | Brightness multiplier (1.0 = no change) |

## Usage

```dsl
read().brightness(amount: 1.5).write(o0)
```
