# photocopy

Ink-on-paper via edge and tonal difference-of-Gaussians, like a bad photocopy

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| detail | float | 30 | 1-100 | DoG blur radius (1-24px); higher detail widens the blur so the edge band captures coarser contours |
| darkness | float | 75 | 0-100 | Overall ink strength: edge gain (mix(4, 18, darkness/100)) and tonal ink threshold (mix(0.35, 0.68, darkness/100)) both scale with this value; higher darkness thickens edge ink and inks a larger share of the tonal range |
| inkColor | color | (0.1, 0.1, 0.1) | - | Dark tone used where ink coverage is highest |
| paperColor | color | (0.96, 0.94, 0.88) | - | Light tone used where there is no ink |

## Notes

- Implements Photocopy filter with two combined ink contributions, so the image's own shapes/tones stay clearly legible as ink rather than relying on sparse hairline edges:
  - **Edge ink**: a symmetric difference-of-Gaussians band (`band = lum(src) - lum(blur)`) inks both sides of an edge as a thin double-line contour (`edgeInk = clamp(abs(band) * edgeGain, 0, 1)`).
  - **Tonal ink**: the source's own mid-dark regions fill with solid ink directly, independent of edge content (`toneInk = 1 - smoothstep(toneHi - 0.26, toneHi, lum(src))`).
  - The two combine as `ink = clamp(max(edgeInk, toneInk), 0, 1)`.
- Two internal textures (`_pcBlurH`, `_pcBlur`) implement a separable Gaussian blur (`pcBlurH` -> `pcBlurV`) of the source image; `pcCombine` reads that blur's luminance as the low-passed half of the DoG band.
- Flat source regions produce zero edge signal (`band = 0` identically), so ink there is driven by the tonal term alone: a flat source at or above the tonal threshold (`lum >= toneHi`) renders as pure `paperColor`, a flat source at or below `toneHi - 0.26` renders as solid `inkColor`, with a smooth ramp between.
- Output alpha is taken from the original source image, not the blurred intermediate.
