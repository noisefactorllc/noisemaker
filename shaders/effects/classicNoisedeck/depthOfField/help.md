# Depth Of Field

Depth of field blur simulation.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| tex | surface | none | — | Depth map source |
| seed | int | 1 | 1–100 | Random seed |
| focalDistance | float | 50 | 1–100 | Focal distance |
| aperture | float | 4 | 1–10 | Aperture size (blur strength) |
| sampleBias | float | 10 | 2–20 | Sample bias |
| depthSource | int | 1 | inputTex/tex | Depth map source |
