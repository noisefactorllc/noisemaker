## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| volumeSize | int | x64 | x16, x32, x64, x128 | Volume resolution |
| metric | int | euclidean | euclidean, manhattan, chebyshev | Distance metric |
| scale | float | 3 | 1–20 | Cell scale |
| cellVariation | float | 50 | 0–100 | Cell variation |
| seed | float | 1 | 0–100 | Random seed |
| colorMode | int | mono | mono, rgb | Color mode |

## Usage

```dsl
cell3d(metric: "manhattan", scale: 5).render3d().write(o0)
noise3d().cell3d().render3d().write(o0)  // chain from noise
```
