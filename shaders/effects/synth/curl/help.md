# curl

3D curl noise using simplex noise

## Description

Curl noise produces smooth, swirling flow fields by computing the curl of a 3D vector potential field built from three decorrelated simplex noise functions. The curl operation ensures the resulting vector field is divergence-free, meaning particles following the flow won't accumulate or disperse—making it ideal for fluid simulations and organic motion patterns.

The effect animates by moving through the z-axis of the 3D noise space, creating smooth temporal evolution.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| scale | float | 16 | 0.5-20 | Scale |
| octaves | int | 1 | 1-3 | Octaves |
| seed | float | 0 | 0-1000 | Seed |
| ridges | bool | false | - | Ridges |
| intensity | float | 1 | 0-2 | Intensity |
| speed | float | 0.5 | 0-2 | Speed |
| outputMode | int | full | flowX/flowY/flowZ/full/magnitude | Output |

## Notes

Output modes:
- **flowX**: Curl X component as grayscale
- **flowY**: Curl Y component as grayscale
- **flowZ**: Curl Z component as grayscale
- **full**: All three components as RGB (X=R, Y=G, Z=B)
- **magnitude**: Length of the curl vector as grayscale

Use cases: fluid flow visualization, particle system motion paths, organic swirling patterns, flow field generation, abstract generative art.
