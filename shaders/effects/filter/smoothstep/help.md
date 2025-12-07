# Smoothstep

Creates a smooth Hermite interpolation between two edge values. Useful for creating smooth thresholds.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| edge0 | float | 0.0 | 0–1 | Lower edge of the transition |
| edge1 | float | 1.0 | 0–1 | Upper edge of the transition |

## Usage

```dsl
read().smoothstep(edge0: 0.3, edge1: 0.7).write(o0)
```
