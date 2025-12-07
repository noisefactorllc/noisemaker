# Lit Edge

Lit edge detection effect. Combines edge detection with the original image to create illuminated edges.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| amount | float | 1.0 | 0.1–5 | Edge detection strength |

## Usage

```dsl
read().litEdge(amount: 1.5).write(o0)
```
