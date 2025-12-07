# Zoom Blur

Radial blur emanating from the center. Creates a zoom/motion effect.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| strength | float | 0.5 | 0–1 | Blur intensity |

## Usage

```dsl
read().zoomBlur(strength: 0.75).write(o0)
```
