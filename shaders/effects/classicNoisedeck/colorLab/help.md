# colorLab

Color manipulation lab

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| seed | int | 1 | 1-100 | Seed |
| colorMode | int | srgbDefault | mono/linearRgb/srgbDefault/oklab/palette | Color space |
| palette | palette | sulphur | none/seventiesShirt/fiveG/afterimage/barstow/bloob/blueSkies/brushedMetal/burningSky/california/columbia/cottonCandy/darkSatin/dealerHat/dreamy/eventHorizon/ghostly/grayscale/hazySunset/heatmap/hypercolor/jester/justBlue/justCyan/justGreen/justPurple/justRed/justYellow/mars/modesto/moss/neptune/netOfGems/organic/papaya/radioactive/royal/santaCruz/sherbet/sherbetDouble/silvermane/skykissed/solaris/spooky/springtime/sproingtime/sulphur/summoning/superhero/toxic/tropicalia/tungsten/vaporwave/vibrant/vintage/vintagePhoto | Palette |
| paletteMode | int | 0 | - | - |
| paletteOffset | vec3 | 0.83,0.6,0.63 | - | Palette offset |
| paletteAmp | vec3 | 0.5,0.5,0.5 | - | Palette amplitude |
| paletteFreq | vec3 | 1,1,1 | - | Palette frequency |
| palettePhase | vec3 | 0.3,0.1,0 | - | Palette phase |
| cyclePalette | int | forward | off/forward/backward | Cycle palette |
| rotatePalette | float | 0 | 0-100 | Rotate palette |
| repeatPalette | int | 1 | 1-5 | Repeat palette |
| hueRotation | float | 0 | 0-360 | Hue rotate |
| hueRange | float | 100 | 0-200 | Hue range |
| saturation | float | 0 | -100-100 | Saturation |
| invert | boolean | false | - | Invert |
| brightness | int | 0 | -100-100 | Brightness |
| contrast | int | 50 | 0-100 | Contrast |
| levels | int | 0 | 0-32 | Posterize |
| dither | int | none | none/threshold/random/randomTime/bayer | Dither |
