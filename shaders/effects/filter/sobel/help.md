# Sobel

Classic Sobel operator for edge detection. Computes gradients in X and Y directions.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| amount | float | 1.0 | 0.1–5 | Edge detection strength |

## Usage

```dsl
read().sobel(amount: 1.5).write(o0)
```
