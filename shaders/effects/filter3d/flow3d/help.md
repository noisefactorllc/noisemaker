# flow3d

3D agent-based flow field

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| volumeSize | int | x32 | x16/x32/x64/x128 | Volume size |
| behavior | int | obedient | none/obedient/crosshatch/unruly/chaotic/randomMix/meandering | Behavior |
| density | float | 20 | 1-100 | Density |
| stride | float | 1 | 0.1-10 | Stride |
| deviation | float | 0.05 | 0-0.5 | Stride Deviation |
| kink | float | 1 | 0-10 | Kink |
| persistence | float | 90 | 0-100 | Trail Persistence |
| input mix | float | 50 | 0-100 | Input Intensity |
| lifetime | float | 30 | 0-60 | Lifetime |
