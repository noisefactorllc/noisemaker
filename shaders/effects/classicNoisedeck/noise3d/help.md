# Noise 3D

3D noise volume generator.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| noiseType | int | 12 | cubes/simplex/sine/spheres/wavyPlanes/wavyPlaneLower/wavyPlaneUpper | 3D noise type |
| noiseScale | float | 25 | 1–100 | Noise scale |
| offsetX | float | 0 | -100–100 | Horizontal offset |
| offsetY | float | 0 | -100–100 | Vertical offset |
| ridges | boolean | false | — | Enable ridge noise |
| colorMode | int | 6 | depthMap/mono/hsv/surfaceNormal | Color output mode |
| hueRotation | float | 0 | 0–360 | Hue rotation offset |
| hueRange | float | 10 | 0–100 | Hue variation range |
| speed | int | 1 | -10–10 | Animation speed |
| seed | int | 1 | 1–100 | Random seed |
