# noise3d

3D noise volume

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| noiseType | int | simplex | cubes/simplex/sine/spheres/wavyPlanes/wavyPlaneLower/wavyPlaneUpper | Noise type |
| noiseScale | float | 25 | 1-100 | Scale |
| offsetX | float | 0 | -100-100 | Offset x |
| offsetY | float | 0 | -100-100 | Offset y |
| ridges | boolean | false | - | Ridges |
| colorMode | int | hsv | depthMap/mono/hsv/surfaceNormal | Color mode |
| hueRotation | float | 0 | 0-360 | Hue rotate |
| hueRange | float | 10 | 0-100 | Hue range |
| speed | int | 1 | -10-10 | Speed |
| seed | int | 1 | 1-100 | Seed |
