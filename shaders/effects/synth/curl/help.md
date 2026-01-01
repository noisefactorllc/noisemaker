# Curl Noise

3D curl noise generator using simplex noise for creating divergence-free vector fields.

## Description

Curl noise produces smooth, swirling flow fields by computing the curl of a 3D vector potential field built from three decorrelated simplex noise functions. The curl operation ensures the resulting vector field is divergence-free, meaning particles following the flow won't accumulate or disperse - making it ideal for fluid simulations and organic motion patterns.

The effect animates by moving through the z-axis of the 3D noise space, creating smooth temporal evolution. The result can be visualized in multiple ways depending on the output mode.

## Parameters

**scale**: Spatial frequency of the noise pattern (0.5-20)
- Higher values create finer, more detailed patterns
- Lower values create broader, smoother patterns

**seed**: Random seed for the noise function (0-1000)
- Different seeds produce different patterns
- Use to generate variations

**octaves**: Number of noise octaves for fractal detail (1-3)
- More octaves add fine-scale turbulence
- Each octave doubles the frequency and halves the amplitude

**speed**: Animation speed (0-2)
- Controls how fast the pattern evolves by moving through z-space
- 0 = static, higher = faster animation

**ridges**: Enable ridged noise mode
- Off: Standard smooth simplex noise
- On: Ridged noise variant with sharper, more dramatic features

**output**: Visualization mode
- `flowX`: Curl X component as grayscale
- `flowY`: Curl Y component as grayscale
- `flowZ`: Curl Z component as grayscale
- `full`: All three components as RGB (X=R, Y=G, Z=B)
- `magnitude`: Length of the curl vector as grayscale

## Use Cases

- Fluid flow visualization
- Particle system motion paths
- Organic swirling patterns
- Flow field generation for simulations
- Abstract generative art with natural motion
- Distortion maps for other effects

## Parameter Summary

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| scale | float | 4.0 | 0.5–20 | Spatial frequency of the noise pattern |
| octaves | int | 1 | 1–3 | Number of noise octaves |
| seed | float | 0 | 0–1000 | Random seed |
| ridges | boolean | false | — | Enable ridged noise mode |
| intensity | float | 1.0 | 0–2 | Output intensity |
| speed | float | 0.5 | 0–2 | Animation speed |
| outputMode | int | full | flowX, flowY, flowZ, full, magnitude | Visualization mode |
