# lensDistortion

Lens distortion simulation

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| seed | int | 1 | 1-100 | Seed |
| shape | int | circle | circle/cosine/diamond/hexagon/octagon/square/triangle | Shape |
| distortion | float | 0 | -100-100 | Distortion |
| loopScale | float | 100 | 1-100 | Loop scale |
| speed | float | 0 | -100-100 | Speed |
| aspectLens | boolean | false | - | 1:1 aspect |
| mode | int | chromaticRgb | chromaticRgb/prismaticHsv | Mode |
| aberrationAmt | float | 50 | 0-100 | Aberration |
| blendMode | int | add | add/alpha | Blend |
| modulate | boolean | false | - | Modulate |
| tint | color | 0,0,0 | - | Tint |
| opacity | float | 0 | 0-100 | Tint opacity |
| hueRotation | float | 0 | 0-360 | Hue rotate |
| hueRange | float | 0 | 0-100 | Hue range |
| saturation | float | 0 | -100-100 | Saturation |
| passthru | float | 50 | 0-100 | Passthru |
| vignetteAmt | float | 0 | -100-100 | Vignette |
