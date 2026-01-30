# tetraColorArray

Apply Tetra color array gradients to images based on luminance.

## Overview

The `tetraColorArray` effect maps input pixel luminance to a gradient created from 2-8 discrete colors. Colors are interpolated smoothly between stops, with optional custom positioning.

This effect is fully compatible with Tetra's color array palette format and can load saved Tetra palettes.

## Parameters

### Mode Settings
- **Color Mode**: Choose the color space for colors and interpolation
  - RGB (default): Standard RGB color space
  - HSV: Hue-Saturation-Value for smooth hue interpolation
  - OkLab: Perceptually uniform color space
  - OKLCH: Cylindrical perceptual space

- **Color Count**: Number of colors in the gradient (2-8)

- **Position Mode**: How colors are distributed
  - Auto: Colors evenly distributed across the gradient
  - Manual: Use custom positions for each color

### Colors
- **Color 1-8**: Color pickers for each gradient stop
  - Color 6 visible when Color Count is 6+
  - Color 7 visible when Color Count is 7+
  - Color 8 visible when Color Count is 8

### Positions (Manual Mode)
- **Position 1-8**: Position (0-1) for each color in the gradient
  - Only visible when Position Mode is set to Manual
  - Positions should generally be in ascending order

### Mapping
- **Repeat**: Multiplier for the luminance value (0.1-10)
  - Higher values create more repetitions across the luminance range
- **Offset**: Offset added to the luminance value (0-1)
  - Shifts the entire gradient mapping

### Output
- **Alpha**: Blend amount with original image (0-1)
  - 0 = original image, 1 = full effect

## Example Gradients

### Grayscale (Default)
5 colors from black to white, evenly spaced.

### Ocean Blues
```
colors: [
  [0.05, 0.10, 0.30],  // Deep sea
  [0.10, 0.25, 0.50],
  [0.20, 0.45, 0.70],
  [0.50, 0.75, 0.90],
  [0.80, 0.92, 0.98]   // Shallow water
]
```

### Fire
```
colors: [
  [0.1, 0.0, 0.0],     // Dark red
  [0.8, 0.2, 0.0],     // Red-orange
  [1.0, 0.5, 0.0],     // Orange
  [1.0, 0.9, 0.3],     // Yellow
  [1.0, 1.0, 0.9]      // White-hot
]
```

## Custom Positions

Manual positioning allows you to control exactly where each color appears in the gradient:

```
colors: [[0,0,0], [1,0,0], [1,1,0], [1,1,1]]
positions: [0.0, 0.2, 0.5, 1.0]
```

This creates:
- Black at 0% luminance
- Red at 20% luminance
- Yellow at 50% luminance
- White at 100% luminance

## Tetra Config Compatibility

This effect uses the same parameter format as Tetra's color array palettes. To use a Tetra palette:

1. Export a palette from Tetra as JSON
2. The `params` object contains `colors`, `positions`, and `positionMode`
3. Set each color picker and position slider to match

Example Tetra palette JSON:
```json
{
  "name": "My Gradient",
  "type": "colors",
  "colorMode": "rgb",
  "params": {
    "colors": [
      [0.05, 0.10, 0.30],
      [0.10, 0.25, 0.50],
      [0.20, 0.45, 0.70],
      [0.50, 0.75, 0.90],
      [0.80, 0.92, 0.98]
    ],
    "positions": [0.0, 0.25, 0.5, 0.75, 1.0],
    "positionMode": "manual"
  }
}
```

## DSL Usage

```javascript
// Basic 5-color grayscale
noise().tetraColorArray()

// Custom fire gradient
noise().tetraColorArray({
  colorCount: 5,
  color0: "#1a0000",
  color1: "#cc3300",
  color2: "#ff8000",
  color3: "#ffe64d",
  color4: "#ffffe6"
})

// Two-color with custom positions
noise().tetraColorArray({
  colorCount: 2,
  color0: "#000066",
  color1: "#ffff00",
  positionMode: 1,  // manual
  pos0: 0.0,
  pos1: 0.7  // Yellow starts at 70% luminance
})

// HSV mode for smooth hue transitions
noise().tetraColorArray({
  colorMode: 1,  // HSV
  colorCount: 3,
  color0: "#ff0000",  // Red
  color1: "#00ff00",  // Green
  color2: "#0000ff"   // Blue
})
```

## References

- [Tetra Palette Editor](https://tetra.noisedeck.app)
