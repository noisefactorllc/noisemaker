# depthOfField

Depth of field blur simulation

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| tex | surface | none | - | Depth map |
| seed | int | 1 | 1-100 | Seed |
| focalDistance | float | 50 | 1-100 | Focal dist |
| aperture | float | 4 | 1-10 | Aperture |
| sampleBias | float | 10 | 2-20 | Sample bias |
| depthSource | int | tex | inputTex/tex | Depth source |
