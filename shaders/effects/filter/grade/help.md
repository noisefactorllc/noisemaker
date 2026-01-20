# Grade

Professional multi-stage color grading pipeline. Includes primary correction, creative looks, three-way color wheels, HSL secondary isolation, and vignette with highlight preservation.

## Parameters

### Look/Preset

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| preset | int | none | none/bleachBypass/cinematic/coolShadows/crossProcess/dayForNight/hardLight/infrared/matrix/monochrome/neon/noir/posterize/psychedelic/sepia/solarize/sunset/tealOrange/technicolor/underwater/vintage/warmFilm | Color grading preset LUT |
| alpha | float | 1 | 0–1 | Preset blend amount |

### Primary Correction

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| temperature | float | 0 | -1–1 | White balance temperature (warm/cool) |
| tint | float | 0 | -1–1 | White balance tint (green/magenta) |
| exposure | float | 0 | -4–4 | Exposure adjustment in stops |
| contrast | float | 0 | -1–1 | Contrast adjustment |
| highlights | float | 0 | -1–1 | Highlight recovery/boost |
| shadows | float | 0 | -1–1 | Shadow recovery/boost |
| whites | float | 0 | -1–1 | White point adjustment |
| blacks | float | 0 | -1–1 | Black point adjustment |
| saturation | float | 1 | 0–2 | Overall saturation |

### Creative

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| vibrance | float | 0 | -1–1 | Vibrance (smart saturation) |
| fadedFilm | float | 0 | 0–1 | Faded film look intensity |
| shadowTint | vec3 | [0.5, 0.5, 0.5] | — | Split toning shadow color |
| highlightTint | vec3 | [0.5, 0.5, 0.5] | — | Split toning highlight color |
| splitToneBalance | float | 0 | -1–1 | Balance between shadow/highlight tinting |

### Curves

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| curveShadows | float | 0 | -1–1 | Curve adjustment for shadows |
| curveMidtones | float | 0 | -1–1 | Curve adjustment for midtones |
| curveHighlights | float | 0 | -1–1 | Curve adjustment for highlights |

### Three-Way Color Wheels

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| wheelShadows | vec3 | [0.5, 0.5, 0.5] | — | Shadow color wheel |
| wheelMidtones | vec3 | [0.5, 0.5, 0.5] | — | Midtone color wheel |
| wheelHighlights | vec3 | [0.5, 0.5, 0.5] | — | Highlight color wheel |
| wheelBalance | float | 0 | -1–1 | Wheel balance adjustment |

### HSL Secondary

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| hslEnable | int | 0 | 0–1 | Enable HSL keying |
| hslHueCenter | float | 0 | 0–1 | Target hue center |
| hslHueRange | float | 0.1 | 0–0.5 | Hue range to select |
| hslSatMin | float | 0 | 0–1 | Minimum saturation to include |
| hslSatMax | float | 1 | 0–1 | Maximum saturation to include |
| hslLumMin | float | 0 | 0–1 | Minimum luminance to include |
| hslLumMax | float | 1 | 0–1 | Maximum luminance to include |
| hslFeather | float | 0.1 | 0–0.5 | Edge feathering |
| hslHueShift | float | 0 | -0.5–0.5 | Hue shift for selected region |
| hslSatAdjust | float | 0 | -1–1 | Saturation adjustment for selected region |
| hslLumAdjust | float | 0 | -1–1 | Luminance adjustment for selected region |

### Vignette

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| vignetteAmount | float | 0 | -1–1 | Vignette intensity (negative = highlight edges) |
| vignetteMidpoint | float | 0.5 | 0–1 | Vignette midpoint distance |
| vignetteRoundness | float | 0 | -1–1 | Vignette shape roundness |
| vignetteFeather | float | 0.5 | 0–1 | Vignette edge softness |
| vignetteHighlightProtect | float | 0 | 0–1 | Protect highlights from vignette |

## Notes

Pipeline order:
1. **Primary**: White balance, exposure, contrast, tonal range
2. **Creative**: Vibrance, faded film, split toning
3. **Wheels**: Three-way color correction
4. **HSL Secondary**: Selective color isolation and adjustment
5. **LUT**: Apply preset look
6. **Vignette**: Final vignette with highlight protection
