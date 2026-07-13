# patchwork

Needlepoint grid of solid-color squares raised by luminance with lit bevel edges (Patchwork)

## Description

The image is broken into a grid of solid-color squares - each cell samples
a single color (a small 3x3 blur at the cell's own center) and derives a
height from that color's luminance. Every cell's face is shaded slightly
by its own height, and the outer rim of each cell is beveled: edges next
to a shorter neighbor catch light and edges next to a taller neighbor sit
in shadow, following a fixed directional light. The result reads as a
needlepoint or patchwork-quilt grid of raised, lit tiles.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| squareSize | float | 16 | 4-64 | Grid cell size in pixels - larger values produce fewer, larger patches |
| relief | float | 50 | 0-100 | Bevel contrast on cell edges - 0 is a flat grid with no bevel, 100 is maximum 3D relief |
| lightAngle | float | 135 | -180-180 | Simulated light direction in degrees (135 = upper-left) - controls which cell edges read as lit vs. shadowed |

## Notes

- Single pass, evaluated on global (tile-aware), center-anchored pixel coordinates so the grid is continuous across CLI render tiles and identical between backends regardless of image resolution.
- Cells are perfectly solid colors; only the outer 15% rim of each cell is beveled, using the height difference against whichever neighbor cell that rim edge borders.
- At `relief` = 0 the bevel has no effect (flat, evenly-shaded squares); at `relief` = 100 raised cells show strong lit/shadowed edges.
- Produces a needlepoint or patchwork-quilt grid of raised, lit tiles.
