## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| volumeSize | int | x64 | x16, x32, x64, x128 | Volume resolution |
| loopAOffset | int | dodecahedron | tetrahedron, cube, octahedron, dodecahedron, icosahedron, sphere, torus, cylinder, cone, capsule | Shape A type |
| loopBOffset | int | octahedron | (same choices as loopAOffset) | Shape B type |
| loopAScale | float | 1 | 1–100 | Shape A scale |
| loopBScale | float | 1 | 1–100 | Shape B scale |
| loopAAmp | float | 50 | -100–100 | Shape A power/influence |
| loopBAmp | float | 50 | -100–100 | Shape B power/influence |
| seed | int | 1 | 1–100 | Noise seed |
| colorMode | int | mono | mono, rgb | Color mode |
