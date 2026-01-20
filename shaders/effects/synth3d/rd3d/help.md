# RD 3D

3D reaction-diffusion simulation (Gray-Scott model).

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| volumeSize | int | x32 | x16/x32/x64/x128 | Volume resolution |
| seed | float | 1 | 0–100 | Random seed |
| iterations | int | 8 | 1–32 | Iterations per frame |
| feed | float | 55 | 10–110 | Feed rate |
| kill | float | 62 | 45–70 | Kill rate |
| rate1 | float | 100 | 50–120 | Diffusion rate A |
| rate2 | float | 50 | 20–80 | Diffusion rate B |
| speed | float | 100 | 10–200 | Simulation speed |
| colorMode | int | mono | mono/gradient | Color mode |
| weight | float | 0 | 0–100 | Input weight from upstream |

## Notes

Adjust feed and kill rates to achieve different pattern types. Common ranges:
- Spots: feed ~55, kill ~62
- Stripes: feed ~42, kill ~63
- Coral: feed ~62, kill ~61
