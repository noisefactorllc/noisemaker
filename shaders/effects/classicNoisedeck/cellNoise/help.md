# cellNoise

Cellular noise patterns

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| shape | int | circle | circle/diamond/hexagon/octagon/square/triangle | Shape |
| scale | float | 75 | 1-100 | Noise scale |
| cellScale | float | 87 | 1-100 | Cell scale |
| cellSmooth | float | 11 | 0-100 | Cell smooth |
| cellVariation | float | 50 | 0-100 | Cell variation |
| loopAmp | int | 1 | 0-5 | Speed |
| paletteMode | int | 4 | - | - |
| seed | int | 1 | 1-100 | Seed |
| colorMode | int | mono | mono/monoInverse/palette | Color space |
| palette | palette | netOfGems | none/seventiesShirt/fiveG/afterimage/barstow/bloob/blueSkies/brushedMetal/burningSky/california/columbia/cottonCandy/darkSatin/dealerHat/dreamy/eventHorizon/ghostly/grayscale/hazySunset/heatmap/hypercolor/jester/justBlue/justCyan/justGreen/justPurple/justRed/justYellow/mars/modesto/moss/neptune/netOfGems/organic/papaya/radioactive/royal/santaCruz/sherbet/sherbetDouble/silvermane/skykissed/solaris/spooky/springtime/sproingtime/sulphur/summoning/superhero/toxic/tropicalia/tungsten/vaporwave/vibrant/vintage/vintagePhoto | Palette |
| paletteOffset | vec3 | 0.5,0.5,0.5 | - | Palette offset |
| cyclePalette | int | forward | off/forward/backward | Cycle palette |
| paletteAmp | vec3 | 0.5,0.5,0.5 | - | Palette amplitude |
| rotatePalette | float | 0 | 0-100 | Rotate palette |
| paletteFreq | vec3 | 2,2,2 | - | Palette frequency |
| repeatPalette | int | 1 | 1-5 | Repeat palette |
| palettePhase | vec3 | 1,1,1 | - | Palette phase |
| tex | surface | none | - | Texture |
| texInfluence | int | cellScale | warp/cellScale/noiseScale/combine/add/divide/min/max/mod/multiply/subtract | Influence |
| texIntensity | float | 100 | 0-100 | Intensity |
