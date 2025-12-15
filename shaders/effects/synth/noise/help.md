## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| noiseType | int | simplex | constant, linear, hermite, catmullRom3x3, catmullRom4x4, bSpline3x3, bSpline4x4, simplex, sine | Noise interpolation algorithm |
| octaves | int | 2 | 1–8 | Number of octaves |
| xScale | float | 75 | 1–100 | Horizontal scale |
| yScale | float | 75 | 1–100 | Vertical scale |
| ridges | boolean | false | — | Enable ridged noise |
| wrap | boolean | true | — | Enable edge wrapping |
| seed | int | 1 | 1–100 | Random seed |
| loopOffset | int | noiseConstant | circle, triangle, diamond, square, pentagon, hexagon, heptagon, octagon, nonagon, decagon, hendecagon, dodecagon, horizontalScan, verticalScan, noise, rings, sine | Loop offset shape |
| loopScale | float | 75 | 1–100 | Loop scale |
| loopAmp | float | 25 | -100–100 | Loop power/amplitude |
| colorMode | int | mono | mono, rgb | Output color mode |
