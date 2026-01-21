# noise

Noise pattern generator

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| aspect | float | null | - | Aspect |
| noiseType | int | simplex | constant/linear/hermite/catmullRom3x3/catmullRom4x4/bSpline3x3/bSpline4x4/simplex/sine | Noise type |
| octaves | int | 2 | 1-8 | Octaves |
| xScale | float | 75 | 1-100 | Horiz scale |
| yScale | float | 75 | 1-100 | Vert scale |
| ridges | boolean | false | - | Ridges |
| wrap | boolean | true | - | Wrap |
| refractMode | int | colorTopology | color/topology/colorTopology | Refract mode |
| refractAmt | float | 0 | 0-100 | Refract |
| seed | int | 1 | 1-100 | Seed |
| loopOffset | int | noise | Shapes:/circle/triangle/diamond/square/pentagon/hexagon/heptagon/octagon/nonagon/decagon/hendecagon/dodecagon/Directional:/horizontalScan/verticalScan/Misc:/noise/rings/sine | Loop offset |
| loopScale | float | 75 | 1-100 | Loop scale |
| loopAmp | float | 25 | -100-100 | Loop power |
| kaleido | int | 1 | 1-32 | Kaleido sides |
| metric | int | circle | circle/diamond/hexagon/octagon/square/triangle | Kaleido shape |
| colorMode | int | hsv | mono/linearRgb/srgb/oklab/palette/hsv | Color space |
| paletteMode | int | 3 | - | - |
| hueRotation | float | 179 | 0-360 | Hue rotate |
| hueRange | float | 25 | 0-100 | Hue range |
| palette | palette | fiveG | none/seventiesShirt/fiveG/afterimage/barstow/bloob/blueSkies/brushedMetal/burningSky/california/columbia/cottonCandy/darkSatin/dealerHat/dreamy/eventHorizon/ghostly/grayscale/hazySunset/heatmap/hypercolor/jester/justBlue/justCyan/justGreen/justPurple/justRed/justYellow/mars/modesto/moss/neptune/netOfGems/organic/papaya/radioactive/royal/santaCruz/sherbet/sherbetDouble/silvermane/skykissed/solaris/spooky/springtime/sproingtime/sulphur/summoning/superhero/toxic/tropicalia/tungsten/vaporwave/vibrant/vintage/vintagePhoto | Palette |
| cyclePalette | int | forward | off/forward/backward | Cycle palette |
| rotatePalette | float | 0 | 0-100 | Rotate palette |
| repeatPalette | int | 1 | 1-5 | Repeat palette |
| paletteOffset | vec3 | 0.5,0.5,0.5 | - | Palette offset |
| paletteAmp | vec3 | 0.5,0.5,0.5 | - | Palette amplitude |
| paletteFreq | vec3 | 1,1,1 | - | Palette frequency |
| palettePhase | vec3 | 0.3,0.2,0.2 | - | Palette phase |
