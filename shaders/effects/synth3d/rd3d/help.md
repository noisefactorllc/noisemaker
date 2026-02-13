# rd3d

3D reaction-diffusion simulation

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| volumeSize | int | x32 | x16/x32/x64/x128 | Volume size |
| seed | int | 1 | 0-100 | - |
| iterations | int | 8 | 1-32 | Iterations |
| feed | float | 55 | 10-110 | Feed rate |
| kill | float | 62 | 45-70 | Kill rate |
| rate1 | float | 100 | 50-120 | Diffuse rate A |
| rate2 | float | 50 | 20-80 | Diffuse rate B |
| speed | float | 100 | 10-200 | Sim speed |
| colorMode | int | mono | mono/gradient | Color mode |
| resetState | boolean | false | - | State |
| source vol | volume | vol0 | - | Source volume |
| source feo | geometry | geo0 | - | Source geometry |
| weight | float | 0 | 0-100 | Input weight |

## Notes

Adjust feed and kill rates to achieve different pattern types. Common ranges:
- Spots: feed ~55, kill ~62
- Stripes: feed ~42, kill ~63
- Coral: feed ~62, kill ~61
