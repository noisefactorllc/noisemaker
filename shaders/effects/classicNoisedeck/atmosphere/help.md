## Usage

```dsl
atmosphere(
  noiseType: 1,
  noiseScale: 85,
  colorMode: 2,
  color1: #ff0000,
  color2: #00ff00
)
```

## Parameters

*   **noiseType**: 1 (Simplex), 2 (Quad Tap).
*   **interp**: Interpolation method (10=Linear, etc).
*   **noiseScale**: Scale of the noise.
*   **loopAmp**: Amplitude of the loop animation.
*   **refractAmt**: Amount of refraction.
*   **ridges**: Enable ridge noise.
*   **wrap**: Enable wrapping.
*   **seed**: Random seed.
*   **colorMode**: 0 (Grayscale), 1 (RGB), 2 (HSV), 3 (OKLab).
*   **hueRotation**: Global hue rotation.
*   **hueRange**: Range of hue variation.
*   **intensity**: Brightness/Contrast intensity.
*   **color1** - **color4**: Palette colors.
