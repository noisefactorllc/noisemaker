# Smooth Edge

Edge detection with Gaussian smoothing. Produces softer edges than standard edge detection.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| amount | float | 1.0 | 0.1–5 | Edge detection strength |

## Usage

```dsl
read().smoothEdge(amount: 1.5).write(o0)
```
