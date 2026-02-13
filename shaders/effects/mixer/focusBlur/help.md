# focusBlur

Focus blur using luminance depth map

## Description

Uses the luminosity of the depth source texture as a proxy for depth. Pixels with luminosity values close to the focal distance remain sharp, while pixels with luminosity far from the focal distance become blurred.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| tex | surface | none | - | Source B |
| focalDistance | float | 50 | 1-100 | Focal dist |
| aperture | float | 4 | 1-10 | Aperture |
| bias | float | 10 | 2-20 | Sample spread |
| depthSource | int | sourceB | sourceA/sourceB | Depth source |

## Notes

- Use a gradient or noise texture as the depth map for interesting focus transitions
- Lower aperture values create more gradual focus falloff
- Higher bias values create softer, more diffuse blur but may impact performance
- The focal distance parameter maps luminosity (0–1) to a percentage, so 50 means pixels with ~0.5 luminosity will be in focus
