# mosaicTiles

Wavy grouted ceramic tiles with beveled relief, or pixelized squares sampled from randomly offset sources with gap fill (Mosaic Tiles, Tiles)

## Description

Covers two filters via `mode`. **mosaic** warps a square
tileSize grid with value noise into wavy ceramic tiles: each tile is
pixelized to one representative sample from its own image region, separated by
grout that is darkened and beveled with directional relief shading
(fixed 135-degree light) on the grout walls. **shifted** keeps a
regular, unwarped square grid; each tile is pixelized to one representative
color sampled from a randomly shifted source position (a per-cell random
offset up to maxOffset% of a tile width), leaving a
small fixed gap between tiles that is filled with backgroundColor, the
inverse of the tile's own home pixel, or the unaltered home pixel, per
`gapFill`.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| mode | int | 0 | mosaic:0, shifted:1 | mosaic: wavy warped-grid ceramic tiles with beveled grout. shifted: regular pixelized tiles sampled from shifted source positions with gaps between them |
| tileSize | float | 32 | 4-128 | Tile/cell size in pixels |
| groutWidth | float | 12 | 0-100 | mosaic-only control; grout band half-width as a percent of tileSize/2. The same uniform also sets shifted mode's fixed inter-tile gap width (percent of tileSize) for visual consistency between the two modes, but its control is only shown in mosaic mode - see Notes |
| relief | float | 40 | 0-100 | mosaic-only; strength of the beveled 3D relief shading on the grout walls - 0 leaves the grout flat and darkened only, higher values increase the light/dark bevel band |
| maxOffset | float | 25 | 0-100 | shifted-only; maximum random source-position offset per tile, as a percent of tile width |
| gapFill | int | 0 | background:0, inverse:1, unaltered:2 | shifted-only; how the gap between shifted tiles is filled - a solid backgroundColor, the color inverse of the tile's own home pixel, or the unaltered home pixel |
| backgroundColor | color | [0.1, 0.1, 0.1] | - | shifted-only, gapFill=background only; the gap fill color |
| seed | int | 1 | 1-100 | Randomizes the mosaic warp pattern and the shifted per-tile offsets without changing their statistics |

## Notes

- Single pass, evaluated on global (tile-aware) pixel coordinates so the grid, warp, and per-cell hashes are continuous across CLI render tiles.
- mosaic's wavy borders come from perturbing the grid-space coordinate with value noise before the floor/fract cell assignment, so neighboring pixels straddling a nominal border pick up slightly different offsets and bend the actual quantized boundary between them.
- mosaic assigns one representative source sample to every pixel in a warped tile, producing a genuinely pixelized tile face while keeping the source lookup inside that tile's image region.
- groutWidth is a single value reused by both modes rather than adding a second gap-width param: mosaic reads it as the grout band's half-width, shifted reads it as the fixed inter-tile gap width. Only mosaic exposes a control for it, since shifted's gap is meant to read as a small fixed structural constant - switch to mosaic mode to change it, then switch back.
- shifted derives one source sample from the tile center plus a per-cell offset, so every tile face is genuinely pixelized rather than showing the continuous input beneath a grid.
- Alpha always comes from the pixel's own unmodified home position.
- Covers wavy ceramic mosaic tiles and pixelized shifted square tiles in one effect.
