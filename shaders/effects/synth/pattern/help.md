# pattern

Geometric pattern generator

## Description

Generates various geometric patterns including stripes, checkerboard, grid, dots, hexagons, triangles, concentric rings, radial lines, spirals, hearts, waves, and zigzags. Useful for creating backgrounds, textures, and masks with clean geometric shapes. Supports animation with seamless looping.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| patternType | int | 7 | 0-11 | Pattern type |
| scale | float | 15 | 1-20 | Scale/size of pattern elements |
| thickness | float | 0.5 | 0-1 | Line/shape thickness |
| smoothness | float | 0.02 | 0-1 | Edge softness (0=sharp, 1=soft) |
| rotation | float | 0 | -180-180 | Rotation angle in degrees |
| animation | int | 0 | 0-3 | Animation mode (0=None, 1=PanX, 2=PanY, 3=Rotate) |
| speed | int | 1 | -5-5 | Animation speed and direction |
| fgColor | vec3 | 1,1,1 | - | Foreground color |
| bgColor | vec3 | 0,0,0 | - | Background color |

## Pattern Types

- **Checkerboard (0)**: Classic alternating square pattern
- **Concentric Rings (1)**: Rings emanating from center, thickness controls ring width
- **Dots (2)**: Regular grid of circles
- **Grid (3)**: Intersecting lines forming a grid
- **Hexagons (4)**: Honeycomb hexagonal tiling
- **Radial Lines (5)**: Lines radiating outward from center, thickness controls line count
- **Spiral (6)**: Archimedean spiral, thickness controls arm width
- **Stripes (7)**: Vertical stripes, use rotation for other orientations
- **Triangular Grid (8)**: Equilateral triangle tiling, thickness controls fill
- **Hearts (9)**: Tiled heart shapes
- **Waves (10)**: Sine-displaced horizontal lines
- **Zigzag (11)**: V-shaped zigzag lines

## Animation

All animation modes loop seamlessly. Speed controls both rate and direction (negative = reverse). Pan modes move along the pattern's own axes, so panning while rotated still loops cleanly.

## Usage

```
search synth

pattern()
  .write(o0)

render(o0)
```

### Examples

```
// Diagonal stripes
pattern({ patternType: 0, rotation: 45, scale: 10 })
  .write(o0)

// Polka dots
pattern({ patternType: 2, scale: 8, thickness: 0.6 })
  .write(o0)

// Honeycomb
pattern({ patternType: 4, scale: 6, fgColor: [1, 0.8, 0], bgColor: [0.2, 0.1, 0] })
  .write(o0)

// Animated hearts
pattern({ patternType: 9, scale: 12, animation: 1, speed: 2, fgColor: [1, 0.2, 0.3] })
  .write(o0)
```
