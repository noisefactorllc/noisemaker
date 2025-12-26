# Lighting Effect

Applies 3D lighting to 2D textures by calculating surface normals from luminosity.

## How It Works

1. **Normal Calculation**: Uses Sobel convolution on the input texture's luminosity to extract gradients, which are converted into 3D surface normals
2. **Lighting Model**: Applies Blinn-Phong lighting with diffuse, specular, and ambient components
3. **Output**: The lit result is combined with the original texture colors

## Parameters

- **Diffuse Color**: Color of the diffuse lighting component
- **Specular Color**: Color of the specular highlights
- **Specular Intensity**: Strength of specular highlights (0.0 - 2.0)
- **Ambient Color**: Base ambient lighting color
- **Light Direction**: Direction vector of the light source (X, Y, Z)
- **Normal Strength**: Controls the prominence of surface details (0.0 - 5.0)

## Usage Tips

- Increase **Normal Strength** to make surface features more pronounced
- Adjust **Light Direction** to change where highlights appear
- Higher **Specular Intensity** creates shinier surfaces
- Works best with textures that have clear luminosity variation
