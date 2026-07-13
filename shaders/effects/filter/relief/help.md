# relief

Two-tone ink/paper relief carving: Bas Relief, Plaster, and Note Paper sketch renderings

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| mode | int | 0 (basRelief) | basRelief, plaster, notePaper | Selects the relief recipe |
| smoothness | float | 30 | 0-100 | Pre-blur radius (0.5-15px) applied to the source before the height field is derived; higher = coarser relief |
| detail | float | 50 | 0-100 | Relief gain: scales the height-field gradient before lighting, controlling how strongly contours read as raised/carved |
| lightAngle | float | 135 | -180-180 | Direction the relief is lit from, in degrees; 135 = upper-left, -45 = lower-right |
| balance | float | 50 | 0-100 | Note Paper ink/paper threshold; enabled only in notePaper mode |
| graininess | float | 30 | 0-100 | Note Paper grain strength; enabled only in notePaper mode |
| inkColor | color | (0.1, 0.1, 0.1) | - | Dark tone, used across all three modes |
| paperColor | color | (0.96, 0.94, 0.88) | - | Light tone, used across all three modes |

## Modes

- **basRelief (0)** - Classic Bas Relief. The blurred image's luminance is treated as a height field; a 1px forward-difference gradient is lit from `lightAngle` and blended 75/25 with the raw height, then tonemapped between `inkColor` and `paperColor`.
- **plaster (1)** - The height field is pushed through a hard `smoothstep(0.35, 0.65, h)` curve and inverted; the squared shade produces a narrow molded highlight before the same 75/25 blend and tonemap as basRelief.
- **notePaper (2)** - The raw height field is thresholded at `balance` into two flat sheets; a directional bevel is applied only near the threshold contour and `graininess` adds surface variation.

## Notes

- Two internal textures (`_rlBlurH`, `_rlBlur`) implement a separable Gaussian blur (`rlBlurH` -> `rlBlurV`) of the source image; `rlShade` reads that blurred result's luminance as the height field. Blurring rgb (rather than luminance directly) keeps the blur passes generic, matching `filter/plasticWrap`'s precedent.
- The light vector is derived analytically from `lightAngle` (no empirical calibration): `L = normalize(vec3(cos(a), sin(a), 0.75))`, `a = radians(lightAngle)`. Blur-chain intermediate texture reads are orientation-transparent on both backends, so this needs no backend-specific compensation.
- Output alpha is taken from the original source image, not the blurred intermediate.
