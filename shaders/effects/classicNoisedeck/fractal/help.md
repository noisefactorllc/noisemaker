# fractal

Fractal pattern generator

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| fractalType | int | julia | julia/mandelbrot/newton | Type |
| symmetry | int | 0 | - | Symmetry |
| zoomAmt | float | 0 | 0-130 | Zoom |
| rotation | int | 0 | -180-180 | Rotate |
| speed | float | 30 | 0-100 | Speed |
| offsetX | float | 70 | -100-100 | Offset x |
| offsetY | float | 50 | -100-100 | Offset y |
| centerX | float | 0 | -100-100 | Center x |
| centerY | float | 0 | -100-100 | Center y |
| mode | int | iter | iter/z | Mode |
| iterations | int | 50 | 1-50 | Iterations |
| colorMode | int | palette | mono/palette/hsv | Color space |
| palette | palette | darkSatin | none/seventiesShirt/fiveG/afterimage/barstow/bloob/blueSkies/brushedMetal/burningSky/california/columbia/cottonCandy/darkSatin/dealerHat/dreamy/eventHorizon/ghostly/grayscale/hazySunset/heatmap/hypercolor/jester/justBlue/justCyan/justGreen/justPurple/justRed/justYellow/mars/modesto/moss/neptune/netOfGems/organic/papaya/radioactive/royal/santaCruz/sherbet/sherbetDouble/silvermane/skykissed/solaris/spooky/springtime/sproingtime/sulphur/summoning/superhero/toxic/tropicalia/tungsten/vaporwave/vibrant/vintage/vintagePhoto | Palette |
| paletteMode | int | 0 | - | - |
| rotation | int | forward | off/forward/backward | Cycle palette |
| offset | float | 0 | 0-100 | Rotate palette |
| repeat | int | 1 | 1-10 | Repeat palette |
| hueRange | float | 100 | 1-100 | Hue range |
| levels | int | 0 | 0-32 | Posterize |
| backgroundColor | color | 0,0,0 | - | Bkg color |
| backgroundOpacity | float | 100 | 0-100 | Bkg opacity |
| cutoff | float | 0 | 0-100 | Cutoff |
