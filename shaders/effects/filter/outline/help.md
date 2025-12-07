# Outline

Sobel-based outline effect. Subtracts edge detection from the original image to create an outline effect.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| amount | float | 1.0 | 0.1–5 | Outline strength |

## Usage

```dsl
read().outline(amount: 2.0).write(o0)
```
