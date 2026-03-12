# shape3d

3D polyhedral shape generator

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| volumeSize | int | x64 | x16/x32/x64/x128 | Volume size |
| colorMode | int | mono | mono/rgb | Color mode |
| loopAOffset | int | dodecahedron | Platonic Solids:/tetrahedron/cube/octahedron/dodecahedron/icosahedron/Other Primitives:/sphere/torus/cylinder/cone/capsule | Loop a |
| loopBOffset | int | octahedron | Platonic Solids:/tetrahedron/cube/octahedron/dodecahedron/icosahedron/Other Primitives:/sphere/torus/cylinder/cone/capsule | Loop b |
| loopAScale | float | 1 | 1-100 | A scale |
| loopBScale | float | 1 | 1-100 | B scale |
| speedA | int | 1 | -5-5 | Animation speed a |
| speedB | int | 1 | -5-5 | Animation speed b |
