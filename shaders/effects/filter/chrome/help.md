# chrome

Liquid-metal chrome: self-distorting oscillating tone curve over a blurred-luminance height field

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| detail | float | 40 | 0-100 | Sine tone-curve band count (`cycles = mix(1, 7, detail/100)`); higher detail packs more light/dark metal bands into the same height range |
| smoothness | float | 40 | 0-100 | Pre-blur radius (1-16px) applied to the source before the height field is derived; higher smoothness produces coarser, larger chrome bands |
| distortion | float | 30 | 0-100 | Self-warp strength: how far each sample point is displaced by the height field's own gradient before the tone curve is evaluated, producing the liquid "swirl" |

## Notes

- Implements Chrome filter: the source's blurred luminance becomes a height field, which is passed through an oscillating sine tone curve to produce swirling metallic bands, with no source color retained.
- Two internal textures (`_chBlurH`, `_chBlur`) implement a separable Gaussian blur (`chBlurH` -> `chBlurV`) of the source image; `chMap` reads that blur's luminance as the height field.
- Self-distortion: a central-difference gradient of the height field (1px UV-space taps) displaces the sample point (`uv' = uv + gradient * distortion/100 * 0.5`) before the height is re-read, so the metal bands visibly ripple rather than tracking the raw luminance contours directly. At `distortion = 0` the displacement is exactly zero.
- A rim-specular boost (`v += pow(v, 8) * 0.5`, clamped) brightens the tone curve's own peaks, reading as a highlight catching a metal ridge.
- Output is always grayscale with a faint cool/blue tint (`vec3(v) * vec3(0.96, 0.98, 1.02)`) - no source color passes through anywhere in this effect. A flat source produces a flat, single-color output (the tone curve is a pure function of the constant height).
- Output alpha is taken from the original source image, not the blurred intermediate.
