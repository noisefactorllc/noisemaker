# shapeMixer

Shape-based mixing

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| blendMode | int | max | add/divide/max/min/mix/mod/multiply/reflect/refract/subtract | Mode |
| loopOffset | int | circle | none/Shapes:/circle/triangle/diamond/square/pentagon/hexagon/heptagon/octagon/Directional:/horizontalScan/verticalScan/Noise:/noiseConstant/noiseLinear/noiseHermite/noiseBSpline3x3/noiseSimplex/noiseSine/Misc:/rings/sine | Shape |
| loopScale | float | 80 | 1-100 | Shape scale |
| animate | int | forward | off/forward/backward | Animate |
| palette | palette | skykissed | none/seventiesShirt/fiveG/afterimage/barstow/bloob/blueSkies/brushedMetal/burningSky/california/columbia/cottonCandy/darkSatin/dealerHat/dreamy/eventHorizon/ghostly/grayscale/hazySunset/heatmap/hypercolor/jester/justBlue/justCyan/justGreen/justPurple/justRed/justYellow/mars/modesto/moss/neptune/netOfGems/organic/papaya/radioactive/royal/santaCruz/sherbet/sherbetDouble/silvermane/skykissed/solaris/spooky/springtime/sproingtime/sulphur/summoning/superhero/toxic/tropicalia/tungsten/vaporwave/vibrant/vintage/vintagePhoto | Palette |
| paletteMode | int | 0 | - | - |
| paletteOffset | vec3 | 0.83,0.6,0.63 | - | Palette offset |
| paletteAmp | vec3 | 0.5,0.5,0.5 | - | Palette amplitude |
| paletteFreq | vec3 | 1,1,1 | - | Palette frequency |
| palettePhase | vec3 | 0.3,0.1,0 | - | Palette phase |
| cyclePalette | int | forward | off/forward/backward | Cycle palette |
| rotatePalette | float | 0 | 0-100 | Rotate palette |
| repeatPalette | int | 1 | 1-10 | Repeat palette |
| levels | int | 0 | 0-32 | Posterize |
| wrap | boolean | true | - | Noise wrap |
| seed | int | 1 | 1-100 | Noise seed |
