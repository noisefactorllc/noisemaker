# pattern

Geometric pattern generator

## Description

Generates various geometric patterns including stripes, checkerboard, grid, dots, hexagons, triangles, concentric rings, radial lines, and spirals. Useful for creating backgrounds, textures, and masks with clean geometric shapes.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| patternType | int | 7 | 0-8 | Pattern Type (0=Checkerboard, 1=ConcentricRings, 2=Dots, 3=Grid, 4=Hexagons, 5=RadialLines, 6=Spiral, 7=Stripes, 8=TriangularGrid) |
| scale | float | 5 | 1-20 | Scale/size of pattern elements |
| thickness | float | 0.5 | 0-1 | Line thickness for line-based patterns |
| smoothness | float | 0.02 | 0-1 | Edge hardness (0=sharp, 1=very soft) |
| rotation | float | 0 | -180-180 | Rotation angle in degrees |
| offsetX | float | 0 | -1-1 | Horizontal offset |
| offsetY | float | 0 | -1-1 | Vertical offset |
| fgColor | vec3 | 1,1,1 | - | Foreground Color |
| bgColor | vec3 | 0,0,0 | - | Background Color |

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
