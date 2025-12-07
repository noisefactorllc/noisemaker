# Contrast

Simple contrast adjustment. Values map from 0–1 to 0–2x contrast.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| amount | float | 0.5 | 0–1 | Contrast amount (0.5 = no change) |

## Usage

```dsl
read().contrast(amount: 0.75).write(o0)
```
