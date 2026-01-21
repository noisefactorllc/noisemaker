# shapes3d

3D geometric shapes

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| seed | int | 1 | 1-100 | Seed |
| shapeA | int | torusVert | capsuleHoriz/capsuleVert/cube/cylinderHoriz/cylinderVert/octahedron/sphere/torusHoriz/torusVert | Shape a |
| shapeB | int | cube | capsuleHoriz/capsuleVert/cube/cylinderHoriz/cylinderVert/octahedron/sphere/torusHoriz/torusVert | Shape b |
| shapeAScale | float | 64 | 1-100 | A scale |
| shapeBScale | float | 27 | 1-100 | B scale |
| shapeAThickness | float | 5 | 1-50 | A thickness |
| shapeBThickness | float | 5 | 1-50 | B thickness |
| blendMode | int | smoothMin | intersect/max/smoothMax/union/min/smoothMin/subtract/aB/bA/smoothAB/smoothBA | Blend |
| smoothness | float | 1 | 1-100 | Smoothness |
| spin | float | 0 | -180-180 | Spin |
| flip | float | 0 | -180-180 | Flip |
| spinSpeed | float | 2 | -10-10 | Spin speed |
| flipSpeed | float | 2 | -10-10 | Flip speed |
| cameraDist | float | 8 | 5-20 | Cam distance |
| backgroundColor | color | 1,1,1 | - | Bkg color |
| backgroundOpacity | float | 0 | 0-100 | Bkg opacity |
| colorMode | int | palette | depth/diffuse/palette | Color mode |
| source | int | none | none/input | Tex source |
| palette | palette | silvermane | none/seventiesShirt/fiveG/afterimage/barstow/bloob/blueSkies/brushedMetal/burningSky/california/columbia/cottonCandy/darkSatin/dealerHat/dreamy/eventHorizon/ghostly/grayscale/hazySunset/heatmap/hypercolor/jester/justBlue/justCyan/justGreen/justPurple/justRed/justYellow/mars/modesto/moss/neptune/netOfGems/organic/papaya/radioactive/royal/santaCruz/sherbet/sherbetDouble/silvermane/skykissed/solaris/spooky/springtime/sproingtime/sulphur/summoning/superhero/toxic/tropicalia/tungsten/vaporwave/vibrant/vintage/vintagePhoto | Palette |
| cyclePalette | int | forward | off/forward/backward | Cycle palette |
| rotatePalette | float | 0 | 0-100 | Rotate palette |
| repeatPalette | int | 1 | 1-5 | Repeat palette |
| wrap | int | repeat | clamp/mirror/repeat | Wrap |
| paletteMode | int | 0 | - | - |
| paletteOffset | vec3 | 0.83,0.6,0.63 | - | Palette offset |
| paletteAmp | vec3 | 0.5,0.5,0.5 | - | Palette amplitude |
| paletteFreq | vec3 | 1,1,1 | - | Palette frequency |
| palettePhase | vec3 | 0.3,0.1,0 | - | Palette phase |
| repetition | boolean | false | - | Repeat |
| animation | int | rotateShape | rotateScene/rotateShape | Rotation |
| flythroughSpeed | float | 0 | -10-10 | Flythrough |
| spacing | int | 10 | 5-20 | Spacing |
