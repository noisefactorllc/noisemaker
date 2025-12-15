## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| loopAOffset | int | square | circle, triangle, diamond, square, pentagon, hexagon, heptagon, octagon, nonagon, decagon, hendecagon, dodecagon, horizontalScan, verticalScan, noiseConstant, noiseLinear, noiseHermite, noiseCatmullRom3x3, noiseCatmullRom4x4, noiseBSpline3x3, noiseBSpline4x4, noiseSimplex, noiseSine, rings, sine | Loop A shape type |
| loopBOffset | int | diamond | (same choices as loopAOffset) | Loop B shape type |
| loopAScale | float | 1 | 1–100 | Loop A scale |
| loopBScale | float | 1 | 1–100 | Loop B scale |
| loopAAmp | float | 50 | -100–100 | Loop A power/amplitude |
| loopBAmp | float | 50 | -100–100 | Loop B power/amplitude |
| seed | int | 1 | 1–100 | Noise seed |
| wrap | boolean | true | — | Enable edge wrapping |
