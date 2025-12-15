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
