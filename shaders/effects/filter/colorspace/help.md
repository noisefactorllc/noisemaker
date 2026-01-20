# Colorspace

Reinterprets RGB values as a different colorspace and converts back to RGB.

## Description

Treats the R, G, B channels as components of HSV, OKLab, or OKLCH and performs the conversion.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| mode | int | hsv | hsv/oklab/oklch | Colorspace to interpret RGB as |

## Modes

- **hsv**: Interpret RGB as Hue, Saturation, Value
- **oklab**: Interpret RGB as OKLab L, a, b components
- **oklch**: Interpret RGB as OKLCH L, C, H components
