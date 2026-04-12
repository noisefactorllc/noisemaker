# noise

Noise pattern generator

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| type | int | simplex | constant/linear/hermite/catmullRom3x3/catmullRom4x4/bSpline3x3/bSpline4x4/simplex/sine | Noise type |
| octaves | int | 2 | 1-8 | Octaves |
| xScale | float | 75 | 1-100 | Horiz scale |
| yScale | float | 75 | 1-100 | Vert scale |
| ridges | boolean | false | - | Ridges |
| wrap | boolean | true | - | Wrap |
| seed | int | 1 | 1-100 | Seed |
| refractMode | int | colorTopology | color/topology/colorTopology | Refract mode |
| refractAmt | float | 0 | 0-100 | Refract |
| loopOffset | int | noise | Shapes:/circle/triangle/diamond/square/pentagon/hexagon/heptagon/octagon/nonagon/decagon/hendecagon/dodecagon/Directional:/horizontalScan/verticalScan/Misc:/noise/rings/sine | Loop offset |
| loopScale | float | 75 | 1-100 | Loop scale |
| speed | float | 25 | -100-100 | Speed |
| kaleido | int | 1 | 1-32 | Kaleido sides |
| metric | int | circle | circle/diamond/hexagon/octagon/square/triangle | Kaleido shape |
| colorMode | int | hsv | mono/linearRgb/srgb/oklab/palette/hsv | Color space |
| paletteMode | int | 3 | - | - |
| hueRotation | float | 179 | 0-360 | Hue rotate |
| hueRange | float | 25 | 0-100 | Hue range |
| palette | palette | fiveG | none/seventiesShirt/fiveG/afterimage/barstow/bloob/blueSkies/brushedMetal/burningSky/california/columbia/cottonCandy/darkSatin/dealerHat/dreamy/eventHorizon/ghostly/grayscale/hazySunset/heatmap/hypercolor/jester/justBlue/justCyan/justGreen/justPurple/justRed/justYellow/mars/modesto/moss/neptune/netOfGems/organic/papaya/radioactive/royal/santaCruz/sherbet/sherbetDouble/silvermane/skykissed/solaris/spooky/springtime/sproingtime/sulphur/summoning/superhero/toxic/tropicalia/tungsten/vaporwave/vibrant/vintage/vintagePhoto | Palette |
| cyclePalette | int | forward | off/forward/backward | Cycle palette |
| rotatePalette | float | 0 | 0-100 | Rotate palette |
| repeatPalette | int | 1 | 1-10 | Repeat palette |

