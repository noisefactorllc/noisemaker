# stamp

Two-tone ink/paper stamp impression from a blurred-luminance threshold, with a torn-edge roughness knob

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| smoothness | float | 30 | 0-100 | Pre-threshold blur radius (0.5-20px); higher smoothness makes the threshold contour follow coarser shapes |
| balance | float | 50 | 0-100 | Ink/paper threshold on the blurred luminance; higher balance shifts coverage toward more ink |
| roughness | float | 0 | 0-100 | Contour ragging: 0 is a clean iso-line (Stamp), higher values perturb the threshold with tile-aware noise for a torn-paper edge (Torn Edges) |
| inkColor | color | (0.1, 0.1, 0.1) | - | Dark tone used where the blurred source reads below the threshold |
| paperColor | color | (0.96, 0.94, 0.88) | - | Light tone used where the blurred source reads above the threshold |

## Notes

- Implements Stamp and Torn Edges Sketch filters as one continuous effect: `roughness = 0` is Stamp's clean two-tone impression; `roughness > 0` progressively tears the contour into Torn Edges' ragged boundary.
- Two internal textures (`_stBlurH`, `_stBlur`) implement a separable Gaussian blur (`stBlurH` -> `stBlurV`) of the source image; `stThreshold` reads that blur's luminance as the height field that gets thresholded.
- The threshold contour is perturbed by tile-aware fractal value noise (`fbm(globalCoord/3.0)`, integer global pixel coordinates so the pattern is seamless across render tiles), scaled by `roughness`; the anti-aliasing half-width also widens slightly with `roughness` so torn edges read as soft/grainy rather than crisply aliased.
- A flat mid-gray source at default `balance` (50) renders only approximately at the midpoint blend of `inkColor`/`paperColor`, not the exact midpoint: 8-bit quantization of the nominal 0.5 source (128/255 = 0.501961) is amplified by the narrow default `aa` (0.01) smoothstep window, landing the blend measurably off-center (~0.655 vs. the idealized ~0.53). A flat source clearly brighter than the threshold still renders as pure `paperColor`, clearly darker as pure `inkColor`.
- Output alpha is taken from the original source image, not the blurred intermediate.
