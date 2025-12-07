# Flow3D

3D agent-based flow field effect with volume accumulation. Direct port of the 2D flow effect to 3D. Agents traverse 3D space leaving trails.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| volumeSize | int | x32 | x16, x32, x64, x128 | Volume resolution |
| behavior | int | obedient | none, obedient, crosshatch, unruly, chaotic, randomMix, meandering | Agent behavior mode |
| density | float | 20 | 1–100 | Agent density |
| stride | float | 1 | 0.1–10 | Movement stride length |
| strideDeviation | float | 0.05 | 0–0.5 | Stride variation |
| kink | float | 1 | 0–10 | Path curvature |
| intensity | float | 90 | 0–100 | Trail persistence |
| inputIntensity | float | 50 | 0–100 | Input volume intensity |
| lifetime | float | 30 | 0–60 | Agent lifetime |

## Usage

```dsl
flow3d(behavior: "meandering", density: 30).render3d().write(o0)
noise3d().flow3d().render3d().write(o0)  // chain from noise
```
