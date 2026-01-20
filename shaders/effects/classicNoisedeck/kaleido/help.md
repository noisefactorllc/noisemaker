# kaleido

Kaleidoscope effect

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| kaleido | int | 8 | 2-32 | Sides |
| metric | int | circle | circle/diamond/hexagon/octagon/square/triangle | Shape |
| direction | int | none | clockwise/counterclock/none | Rotate |
| loopOffset | int | circle | Shapes:/circle/triangle/diamond/square/pentagon/hexagon/heptagon/octagon/nonagon/decagon/hendecagon/dodecagon/Directional:/horizontalScan/verticalScan/Noise:/noiseConstant/noiseLinear/noiseHermite/noiseCatmullRom3x3/noiseCatmullRom4x4/noiseBSpline3x3/noiseBSpline4x4/noiseSimplex/noiseSine/Misc:/rings/sine | Loop offset |
| loopScale | float | 1 | 1-100 | Loop scale |
| loopAmp | float | 5 | -100-100 | Loop power |
| seed | int | 1 | 1-100 | Seed |
| wrap | boolean | true | - | Wrap |
| kernel | int | none | none/blur/derivatives/derivDivide/edge/emboss/outline/pixels/posterize/shadow/sharpen/sobel | Effect |
| effectWidth | float | 0 | 0-10 | Effect width |
