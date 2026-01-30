# tetraCosine

Apply Tetra cosine gradient palettes to images based on luminance.

## Overview

The `tetraCosine` effect uses the Inigo Quilez cosine gradient formula to map input luminance to colors:

```
color(t) = offset + amplitude × cos(2π × (frequency × t + phase))
```

Where `t` is the input pixel's luminance (0-1).

This effect is fully compatible with Tetra's cosine palette format and can load saved Tetra palettes.

## Parameters

### Color Mode
- **Color Mode**: Choose the color space for the gradient calculation
  - RGB (default): Standard RGB color space
  - HSV: Hue-Saturation-Value for intuitive hue cycling
  - OkLab: Perceptually uniform color space
  - OKLCH: Cylindrical perceptual space with explicit hue control

### Offset (Center/Bias)
- **Offset R/G/B**: The center point for each channel (0-1)
  - Controls the "midpoint" color of the gradient
  - Default: 0.5, 0.5, 0.5 (gray center)

### Amplitude
- **Amp R/G/B**: The amplitude of color variation for each channel (0-1)
  - Controls how far the gradient swings from the offset
  - Default: 0.5, 0.5, 0.5 (full range)

### Frequency
- **Freq R/G/B**: How many cycles per gradient length (0-4)
  - Higher values create more repetitions
  - Default: 1.0, 1.0, 1.0 (one cycle)

### Phase
- **Phase R/G/B**: Phase offset for each channel (0-1)
  - Controls where in the cosine cycle each channel starts
  - Default: 0.0, 0.33, 0.67 (rainbow)

### Mapping
- **Repeat**: Multiplier for the luminance value (0.1-10)
  - Higher values create more repetitions across the luminance range
- **Offset**: Offset added to the luminance value (0-1)
  - Shifts the entire gradient mapping

### Output
- **Alpha**: Blend amount with original image (0-1)
  - 0 = original image, 1 = full effect

## Classic Presets

### Rainbow (Default)
```
offset: [0.5, 0.5, 0.5]
amp: [0.5, 0.5, 0.5]
freq: [1.0, 1.0, 1.0]
phase: [0.0, 0.33, 0.67]
```

### Fire
```
offset: [0.5, 0.5, 0.0]
amp: [0.5, 0.5, 0.0]
freq: [1.0, 1.0, 0.0]
phase: [0.0, 0.15, 0.0]
```

### Ocean
```
offset: [0.5, 0.5, 0.5]
amp: [0.5, 0.5, 0.5]
freq: [1.0, 1.0, 1.0]
phase: [0.0, 0.1, 0.2]
```

## Tetra Config Compatibility

This effect uses the same parameter format as Tetra's cosine palettes. To use a Tetra palette:

1. Export a palette from Tetra as JSON
2. The `params` object contains `offset`, `amp`, `freq`, `phase` arrays
3. Set each slider to match the corresponding values

Example Tetra palette JSON:
```json
{
  "name": "My Palette",
  "type": "cosine",
  "colorMode": "rgb",
  "params": {
    "offset": [0.5, 0.5, 0.5],
    "amp": [0.5, 0.5, 0.5],
    "freq": [1.0, 1.0, 1.0],
    "phase": [0.0, 0.33, 0.67]
  }
}
```

## DSL Usage

```javascript
// Basic rainbow gradient
noise().tetraCosine()

// Fire gradient
noise().tetraCosine({
  offsetR: 0.5, offsetG: 0.5, offsetB: 0.0,
  ampR: 0.5, ampG: 0.5, ampB: 0.0,
  freqR: 1.0, freqG: 1.0, freqB: 0.0,
  phaseR: 0.0, phaseG: 0.15, phaseB: 0.0
})

// HSV color mode with hue cycling
noise().tetraCosine({
  colorMode: 1,  // HSV
  offsetR: 0.5, offsetG: 0.85, offsetB: 0.85,
  ampR: 0.5, ampG: 0.1, ampB: 0.1,
  freqR: 1.0, freqG: 0.5, freqB: 0.5,
  phaseR: 0.0, phaseG: 0.0, phaseB: 0.0
})
```

## References

- [Inigo Quilez - Palettes](https://iquilezles.org/articles/palettes/)
- [Tetra Palette Editor](https://tetra.noisedeck.app)
