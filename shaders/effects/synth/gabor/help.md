# gabor

Anisotropic bandlimited noise via sparse Gabor convolution

## Description

Generates procedural noise by scattering Gabor kernels (windowed cosines) across a grid. Unlike isotropic noise generators, Gabor noise supports directional control, making it suitable for wood grain, fabric, flowing water, brushed metal, and other oriented textures.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| scale | float | 75 | 1-100 | Spatial frequency of the noise |
| orientation | float | 0 | -180-180 | Dominant grain direction in degrees |
| bandwidth | float | 75 | 1-100 | Kernel width — lower values give sharper, more defined patterns |
| isotropy | float | 0 | 0-100 | 0 = fully directional, 100 = random orientations per kernel |
| density | int | 3 | 1-8 | Number of impulse points per grid cell |
| octaves | int | 1 | 1-5 | Fractal layering — each octave adds finer detail |
| speed | int | 1 | 0-5 | Animation rate (0 = frozen) |
| seed | int | 1 | 1-100 | Randomization seed |

## Notes

- **Orientation** is the key differentiator from other noise types — it controls the dominant direction of the pattern
- **Isotropy** at 0 gives strongly directional patterns; at 100 each kernel picks a random angle, producing noise closer to standard isotropic noise
- **Density** increases the number of kernels per cell — higher values give smoother, more filled results but cost more to compute
- **Octaves** layer noise at increasing frequencies, adding fine detail on top of coarser structure
