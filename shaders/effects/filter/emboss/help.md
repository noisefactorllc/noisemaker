# Emboss

Emboss convolution effect. Creates a raised relief appearance as if the image is pressed into metal.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| amount | float | 1.0 | 0.1–5 | Emboss strength |

## Usage

```dsl
read().emboss(amount: 2.0).write(o0)
```
