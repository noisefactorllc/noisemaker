# stipple

Discrete random marks reproducing image tone: pointillize dots, mezzotint dots/lines/strokes, or reticulation (Pointillize, Mezzotint, Reticulation)

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| mode | int | 0 | pointillize:0, mezzoDots:1, mezzoLines:2, mezzoStrokes:3, reticulation:4 | pointillize paints colored dots on paperColor, one per Voronoi cell; mezzoDots/Lines/Strokes hard-threshold each RGB channel against isotropic/vertical-streak/diagonal-streak value noise (Mezzotint's three conversion types); reticulation is a two-tone ink/paper tonemap against clumped fBm noise |
| cellSize | float | 8 | 3-64 | pointillize-only; Voronoi cell size in pixels (dot spacing) |
| grainSize | float | 2 | 0.5-16 | mezzo/reticulation-only; noise scale - smaller values give finer grain |
| density | float | 50 | 0-100 | mezzo/reticulation-only; biases the noise threshold - higher values darken the result (more ink) |
| paperColor | color | [0.98, 0.96, 0.9] | - | pointillize-only; background color showing between dots |
| seed | int | 1 | 1-100 | Randomizes the dot jitter / noise field pattern without changing its statistics |

## Notes

- Single pass, evaluated on global (tile-aware) pixel coordinates so the dot grid and noise fields align seamlessly across CLI render tiles.
- Pointillize dot radius grows with the cell seed point's inverse luminance (darker areas get bigger dots), matching Pointillize's tendency to thicken coverage in shadow regions; edges are antialiased via `fwidth`.
- Mezzotint modes are intentionally hard-edged (no antialiasing) - real mezzotint conversion is a binary process, and each RGB channel is thresholded independently, which is what produces the characteristic colored (non-grayscale) speckle on color images.
- mezzoLines streaks noise vertically; mezzoStrokes uses the same streaked noise rotated 45 degrees for a diagonal engraving look.
- Reticulation's clump noise amplitude is modulated by local luminance so shadows fill in with dense, broad clumps while highlights break up into fine grain.
- Covers pointillize dots, mezzotint marks, and reticulated ink/paper texture in one effect.
