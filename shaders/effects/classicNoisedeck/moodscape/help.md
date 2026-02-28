# moodscape

Refracted value noise with multiple color modes

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| interp | int | simplex | constant/linear/hermite/catmullRom3x3/catmullRom4x4/bSpline3x3/bSpline4x4/simplex/sine | Interpolation |
| noiseScale | float | 85 | 1-200 | Scale |
| speed | float | 25 | 0-100 | Speed |
| refractAmt | float | 5 | 0-100 | Refract |
| ridges | boolean | true | - | Ridges |
| wrap | boolean | true | - | Wrap |
| seed | float | 44 | 0-100 | Seed |
| colorMode | int | hsv | mono/rgb/hsv/oklab | Color Mode |
| hueRotation | float | 180 | 0-360 | Hue Rotation |
| hueRange | float | 25 | 0-100 | Hue Range |
| intensity | float | 0 | -100-100 | Intensity |
