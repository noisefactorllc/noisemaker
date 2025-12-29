# Curl Noise

2D curl noise generator for creating divergence-free flow fields.

## Description

Curl noise produces smooth, swirling flow fields by computing the curl of a potential field. Unlike standard noise, curl noise is divergence-free, meaning particles following the flow won't accumulate or disperse - making it ideal for fluid simulations and organic motion patterns.

The effect computes the curl of an underlying noise function (either Perlin or value noise) to create perpendicular flow vectors. The result is visualized as an RGB image where:
- Red channel: horizontal flow component
- Green channel: vertical flow component  
- Blue channel: flow magnitude

## Parameters

**noise type**: The underlying noise basis function
- `perlin`: Classic Perlin gradient noise with smooth interpolation
- `valueLinear`: Value noise with linear interpolation
- `valueHermite`: Value noise with cubic (Hermite) interpolation
- `valueCatmullRom`: Value noise with quintic interpolation

**scale**: Spatial frequency of the noise pattern (1-100)
- Higher values create finer detail
- Lower values create broader patterns

**octaves**: Number of noise octaves for fractal detail (1-6)
- More octaves add fine-scale variation
- Each octave doubles the frequency and halves the amplitude

**seed**: Random seed for the noise function (0-100)
- Different seeds produce different patterns
- Use to generate variations

**speed**: Animation speed multiplier (0-10)
- Controls how fast the pattern evolves over time
- 0 = static, higher = faster animation

**strength**: Curl intensity multiplier (0-5)
- Scales the output vector field magnitude
- Higher values create stronger flow patterns

## Use Cases

- Fluid flow visualization
- Particle system motion paths
- Organic swirling patterns
- Flow field generation for simulations
- Abstract generative art with natural motion
