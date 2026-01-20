# Focus Blur

Simulates depth of field blur using one surface as a depth map.

## Description

Uses the luminosity of the depth source texture as a proxy for depth. Pixels with luminosity values close to the focal distance remain sharp, while pixels with luminosity far from the focal distance become blurred.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| tex | surface | none | — | Source B input surface |
| focalDistance | float | — | 1–100 | Depth value (luminosity) that will be in sharp focus |
| aperture | float | — | 1–10 | How quickly blur increases with distance from focal plane |
| sampleSpread | float | — | 2–20 | Spread of the blur samples (higher = wider blur) |
| depthSource | int | sourceB | sourceA/sourceB | Which surface to use as the depth map |

## Notes

- Use a gradient or noise texture as the depth map for interesting focus transitions
- Lower aperture values create more gradual focus falloff
- Higher sample spread values create softer, more diffuse blur but may impact performance
- The focal distance parameter maps luminosity (0–1) to a percentage, so 50 means pixels with ~0.5 luminosity will be in focus
