# Feedback

Feedback loop with blend modes and transforms. Blends the live input with a feedback buffer using various blend modes, with transform controls, color controls, lens effects, and refraction.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| resetState | boolean | false | — | Reset button to clear feedback state |
| blendMode | int | mix | add/cloak/colorBurn/colorDodge/darken/difference/exclusion/glow/hardLight/lighten/mix/multiply/negation/overlay/phoenix/reflect/screen/softLight/subtract | Blend mode for combining feedback with input |
| mixAmt | float | 0 | 0–100 | Feedback mix amount |
| scaleAmt | float | 100 | 75–200 | Scale percentage for feedback transform |
| rotation | float | 0 | -180–180 | Rotation of feedback in degrees |
| refractAAmt | float | 0 | 0–100 | Refraction amount from A to B |
| refractBAmt | float | 0 | 0–100 | Refraction amount from B to A |
| refractADir | float | 0 | 0–360 | Refraction direction A in degrees |
| refractBDir | float | 0 | 0–360 | Refraction direction B in degrees |
| hueRotation | float | 0 | -180–180 | Hue shift applied to feedback |
| intensity | float | 0 | -100–100 | Color intensity adjustment |
| aberrationAmt | float | 0 | 0–100 | Chromatic aberration amount |
| distortion | float | 0 | -100–100 | Lens distortion amount |

## Notes

Parameter categories:
- **Transform**: scaleAmt, rotation
- **Refract**: refractAAmt, refractBAmt, refractADir, refractBDir
- **Color**: hueRotation, intensity
- **Lens**: aberrationAmt, distortion
