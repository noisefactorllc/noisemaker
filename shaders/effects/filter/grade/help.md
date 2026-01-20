# grade

Professional multi-stage color grading pipeline

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| preset | int | none | none/bleachBypass/cinematic/coolShadows/crossProcess/dayForNight/hardLight/infrared/matrix/monochrome/neon/noir/posterize/psychedelic/sepia/solarize/sunset/tealOrange/technicolor/underwater/vintage/warmFilm | Preset |
| alpha | float | 1 | 0-1 | Alpha |
| temperature | float | 0 | -1-1 | Temperature |
| tint | float | 0 | -1-1 | Tint |
| exposure | float | 0 | -4-4 | Exposure |
| contrast | float | 0 | -1-1 | Contrast |
| highlights | float | 0 | -1-1 | Highlights |
| shadows | float | 0 | -1-1 | Shadows |
| whites | float | 0 | -1-1 | Whites |
| blacks | float | 0 | -1-1 | Blacks |
| saturation | float | 1 | 0-2 | Saturation |
| vibrance | float | 0 | -1-1 | Vibrance |
| fadedFilm | float | 0 | 0-1 | Faded Film |
| shadowTint | vec3 | 0.5,0.5,0.5 | - | Shadow Tint |
| highlightTint | vec3 | 0.5,0.5,0.5 | - | Highlight Tint |
| splitToneBalance | float | 0 | -1-1 | Split Tone Balance |
| curveShadows | float | 0 | -1-1 | Curve Shadows |
| curveMidtones | float | 0 | -1-1 | Curve Midtones |
| curveHighlights | float | 0 | -1-1 | Curve Highlights |
| wheelShadows | vec3 | 0.5,0.5,0.5 | - | Shadows Wheel |
| wheelMidtones | vec3 | 0.5,0.5,0.5 | - | Midtones Wheel |
| wheelHighlights | vec3 | 0.5,0.5,0.5 | - | Highlights Wheel |
| wheelBalance | float | 0 | -1-1 | Wheel Balance |
| hslEnable | int | 0 | 0-1 | Enable HSL Key |
| hslHueCenter | float | 0 | 0-1 | Hue Center |
| hslHueRange | float | 0.1 | 0-0.5 | Hue Range |
| hslSatMin | float | 0 | 0-1 | Sat Min |
| hslSatMax | float | 1 | 0-1 | Sat Max |
| hslLumMin | float | 0 | 0-1 | Lum Min |
| hslLumMax | float | 1 | 0-1 | Lum Max |
| hslFeather | float | 0.1 | 0-0.5 | Feather |
| hslHueShift | float | 0 | -0.5-0.5 | Hue Shift |
| hslSatAdjust | float | 0 | -1-1 | Sat Adjust |
| hslLumAdjust | float | 0 | -1-1 | Lum Adjust |
| vignetteAmount | float | 0 | -1-1 | Vignette Amount |
| vignetteMidpoint | float | 0.5 | 0-1 | Vignette Midpoint |
| vignetteRoundness | float | 0 | -1-1 | Vignette Roundness |
| vignetteFeather | float | 0.5 | 0-1 | Vignette Feather |
| vignetteHighlightProtect | float | 0 | 0-1 | Highlight Protect |

## Notes

Pipeline order:
1. **Primary**: White balance, exposure, contrast, tonal range
2. **Creative**: Vibrance, faded film, split toning
3. **Wheels**: Three-way color correction
4. **HSL Secondary**: Selective color isolation and adjustment
5. **LUT**: Apply preset look
6. **Vignette**: Final vignette with highlight protection
