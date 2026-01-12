# Distortion

A mixer effect that applies displacement, reflection, and refraction effects between two surfaces using one surface as a height/normal map to distort the other.

## Parameters

- **source B**: The secondary input surface
- **mode**: The distortion type to apply
  - `displace`: Offsets pixels based on color luminosity and angle
  - `refract`: Bends light through the surface based on calculated normals
  - `reflect`: Creates reflection effects with optional chromatic aberration
- **map source**: Which surface to use as the distortion map
  - `sourceA`: Use the input surface as the map, distort source B
  - `sourceB`: Use source B as the map, distort the input surface
- **intensity**: Controls the strength of the distortion effect
- **wrap**: How to handle coordinates outside the texture bounds
  - `mirror`: Reflects at boundaries
  - `repeat`: Tiles the texture
  - `clamp`: Clamps to edge pixels
- **smoothing**: Controls the smoothness of calculated normals (higher = smoother)
- **aberration**: Chromatic aberration intensity for reflection mode (separates RGB channels)

## Usage Tips

- Use a noise or gradient texture as source B with "source B" map source to create organic distortion effects
- Reflection mode with high aberration creates prismatic rainbow effects
- Refraction mode simulates looking through glass or water
- Displacement mode creates warping effects based on color intensity
