# shape

Dual-loop shape pattern generator

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| loopAOffset | int | square | Shapes:/circle/triangle/diamond/square/pentagon/hexagon/heptagon/octagon/nonagon/decagon/hendecagon/dodecagon/Directional:/horizontalScan/verticalScan/Noise:/noiseConstant/noiseLinear/noiseHermite/noiseCatmullRom3x3/noiseCatmullRom4x4/noiseBSpline3x3/noiseBSpline4x4/noiseSimplex/noiseSine/Misc:/rings/sine | Loop a |
| loopBOffset | int | diamond | Shapes:/circle/triangle/diamond/square/pentagon/hexagon/heptagon/octagon/nonagon/decagon/hendecagon/dodecagon/Directional:/horizontalScan/verticalScan/Noise:/noiseConstant/noiseLinear/noiseHermite/noiseCatmullRom3x3/noiseCatmullRom4x4/noiseBSpline3x3/noiseBSpline4x4/noiseSimplex/noiseSine/Misc:/rings/sine | Loop b |
| loopAScale | float | 1 | 1-100 | A scale |
| loopBScale | float | 1 | 1-100 | B scale |
| speedA | float | 50 | -100-100 | Speed a |
| speedB | float | 50 | -100-100 | Speed b |
| seed | int | 1 | 1-100 | Noise seed |
| wrap | boolean | true | - | Wrap |
