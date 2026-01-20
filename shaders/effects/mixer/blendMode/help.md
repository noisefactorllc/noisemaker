# Blend Mode

Blend two inputs using selectable blend mode.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| tex | surface | none | — | Source B texture to blend with |
| mode | int | add | add/burn/darken/diff/dodge/exclusion/hardLight/lighten/mix/multiply/negation/overlay/phoenix/screen/softLight/subtract | Blend mode |
| mixAmt | float | 0 | -100–100 | Mix amount (0 = original, positive = more blend) |

## Blend Modes

- **add**: Additive blending
- **burn**: Color burn
- **darken**: Darken (min)
- **diff**: Difference
- **dodge**: Color dodge
- **exclusion**: Exclusion
- **hardLight**: Hard light
- **lighten**: Lighten (max)
- **mix**: Linear mix
- **multiply**: Multiply
- **negation**: Negation
- **overlay**: Overlay
- **phoenix**: Phoenix
- **screen**: Screen
- **softLight**: Soft light
- **subtract**: Subtract

## Usage

```
noise().blendMode(tex: read(o1), mode: overlay, mixAmt: 50).write(o0)
```
```
