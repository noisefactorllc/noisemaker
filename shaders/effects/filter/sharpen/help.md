# Sharpen

Sharpen convolution effect. Enhances image detail and edges.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| amount | float | 1.0 | 0.1–5 | Sharpening strength |

## Usage

```dsl
read().sharpen(amount: 2.0).write(o0)
```
