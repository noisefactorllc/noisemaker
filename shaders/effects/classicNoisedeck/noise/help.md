# Noise

Noise pattern generator with multiple noise types and octaves.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| noiseType | int | 10 | constant/linear/hermite/catmullRom3x3/catmullRom4x4/bSpline3x3/bSpline4x4/simplex/sine | Noise interpolation type |
| octaves | int | 2 | 1–8 | Fractal octave count |
| xScale | float | 75 | 1–100 | Horizontal scale |
| yScale | float | 75 | 1–100 | Vertical scale |
| ridges | boolean | false | — | Enable ridge noise |
| wrap | boolean | true | — | Enable seamless tiling |
| refractMode | int | 2 | color/topology/colorTopology | Refraction mode |
| refractAmt | float | 0 | — | Refraction amount |
| kaleido | int | — | — | Kaleidoscope segments |
| metric | int | — | — | Distance metric |
| colorMode | int | — | — | Color output mode |
| paletteMode | int | — | — | Palette selection |
| cyclePalette | int | — | — | Palette cycling |
| rotatePalette | float | — | — | Palette rotation |
| repeatPalette | int | — | — | Palette repetitions |
| hueRange | float | — | — | Hue variation range |
| hueRotation | float | — | — | Hue rotation offset |
