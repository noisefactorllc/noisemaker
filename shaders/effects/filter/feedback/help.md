# feedback

Feedback loop with blend modes and transforms

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| blendMode | int | mix | add/cloak/colorBurn/colorDodge/darken/difference/exclusion/glow/hardLight/lighten/mix/multiply/negation/overlay/phoenix/reflect/screen/softLight/subtract | Mode |
| mix | float | 0 | 0-100 | Feedback |
| scaleAmt | float | 100 | 75-200 | Scale % |
| rotation | float | 0 | -180-180 | Rotate |
| refractAAmt | float | 0 | 0-100 | Refract a→b |
| refractBAmt | float | 0 | 0-100 | Refract b→a |
| refractADir | float | 0 | 0-360 | Refract dir a |
| refractBDir | float | 0 | 0-360 | Refract dir b |
| hueRotation | float | 0 | -180-180 | Hue shift |
| intensity | float | 0 | -100-100 | Intensity |
| aberration | float | 0 | 0-100 | Aberration |
| distortion | float | 0 | -100-100 | Distortion |
| resetState | boolean | false | - | State |

## Notes

Parameter categories:
- **Transform**: scaleAmt, rotation
- **Refract**: refractAAmt, refractBAmt, refractADir, refractBDir
- **Color**: hueRotation, intensity
- **Lens**: aberration, distortion
