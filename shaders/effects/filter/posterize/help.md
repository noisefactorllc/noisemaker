# Posterize

Color posterization effect. Reduces color levels for a poster-like appearance.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| levels | float | 4.0 | 1–20 | Number of color levels |

## Usage

```dsl
read().posterize(levels: 6).write(o0)
```
