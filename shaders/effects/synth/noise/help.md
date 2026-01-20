# noise

Value noise with multiple interpolation types

## Description

Generates procedural value noise with various interpolation algorithms including simplex and sine variants. Supports octave layering, animation loops, and color output modes.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| noiseType | int | simplex | constant/linear/hermite/catmullRom3x3/catmullRom4x4/bSpline3x3/bSpline4x4/simplex/sine | Noise type |
| octaves | int | 2 | 1-8 | Octaves |
| xScale | float | 75 | 1-100 | Horiz scale |
| yScale | float | 75 | 1-100 | Vert scale |
| seed | int | 1 | 1-100 | Seed |
| wrap | boolean | true | - | Wrap |
| ridges | boolean | false | - | Ridges |
| loopOffset | int | noise | Shapes:/circle/triangle/diamond/square/pentagon/hexagon/heptagon/octagon/nonagon/decagon/hendecagon/dodecagon/Directional:/horizontalScan/verticalScan/Misc:/noise/rings/sine | Loop offset |
| loopScale | float | 75 | 1-100 | Loop scale |
| loopAmp | float | 25 | -100-100 | Loop power |
| colorMode | int | rgb | mono/rgb | Color mode |
