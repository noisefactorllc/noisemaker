# lowPoly

Low-polygon style render using Voronoi cells

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| scale | int | 50 | 2-100 | Cell size |
| seed | int | 1 | 1-100 | Random seed for cell layout |
| mode | int | edges | flat/edges/distance2/distance3 | Low Poly rendering mode |
| edgeStrength | float | 0.15 | 0-1 | Strength of edge or distance shading; inactive in flat mode |
| edgeColor | color | 0,0,0 | - | Color used by edges mode and explicit cell borders |
| borderWidth | float | 0 | 0-100 | Width of the Voronoi cell boundary drawn in edgeColor |
| lightIntensity | float | 0 | 0-100 | Brightens the selected mode's cell shading while preserving hue and border color; 0 = off |
| alpha | float | 1.0 | 0-1 | Blend with original input |
| speed | int | 0 | 0-5 | Animation speed (0=static) |

## Modes

- **flat**: Pure solid cell color, no edges
- **edges**: Solid cell color with darkened edges toward edge color
- **distance2**: 2nd-nearest Voronoi distance multiplied with cell color — shows cell edge structure
- **distance3**: 3rd-nearest Voronoi distance multiplied with cell color — shows ridge/intersection patterns

## Animation

Seed points drift in per-cell circular paths that loop seamlessly. Each cell has a unique phase and radius so the motion looks organic rather than uniform.

## Borders and lighting

`borderWidth` and `lightIntensity` are optional modifiers on the selected Low Poly
mode. They do not replace the mode or disable its controls.

`borderWidth` is scaled as a percentage of the nominal cell radius (`0.5 / n`). A
bounded 5x5 site search measures perpendicular distance to the true nearest Voronoi
bisector, producing consistent geometric border thickness across differently shaped
cells. Only a derivative-sized screen-space fringe is antialiased; the band has a
solid `edgeColor` core.

`lightIntensity` raises the selected mode's value with a bounded exposure curve and
scales RGB channels together to retain hue without clipping. The opaque `edgeColor`
border is composited after the light so it does not brighten.
