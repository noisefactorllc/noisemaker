# pattern

Geometric pattern generator

## Description

Generates various geometric patterns including stripes, checkerboard, grid, dots, hexagons, triangles, diamonds. Useful for creating backgrounds, textures, and masks with clean geometric shapes.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| patternType | int | 0 | 0-5 | Pattern Type (0=Stripes, 1=Checkerboard, 2=Grid, 3=Dots, 4=Hexagons, 5=Diamonds) |
| scale | float | 5 | 1-20 | Scale/size of pattern elements |
| thickness | float | 0.5 | 0-1 | Line thickness for line-based patterns |
| smoothness | float | 0.02 | 0-1 | Edge hardness (0=sharp, 1=very soft) |
| rotation | float | 0 | -180-180 | Rotation angle in degrees |
| offsetX | float | 0 | -1-1 | Horizontal offset |
| offsetY | float | 0 | -1-1 | Vertical offset |
| fgColor | vec3 | 1,1,1 | - | Foreground Color |
| bgColor | vec3 | 0,0,0 | - | Background Color |

## Pattern Types

- **Stripes (0)**: Vertical stripes, use rotation for other orientations
- **Checkerboard (1)**: Classic alternating square pattern
- **Grid (2)**: Intersecting lines forming a grid
- **Dots (3)**: Regular grid of circles
- **Hexagons (4)**: Honeycomb hexagonal tiling
- **Diamonds (5)**: Rotated square / diamond pattern

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
pattern({ patternType: 3, scale: 8, thickness: 0.6 })
  .write(o0)

// Honeycomb
pattern({ patternType: 4, scale: 6, fgColor: [1, 0.8, 0], bgColor: [0.2, 0.1, 0] })
  .write(o0)

// Brick wall
pattern({ patternType: 7, scale: 4, fgColor: [0.8, 0.3, 0.2] })
  .write(o0)
```
