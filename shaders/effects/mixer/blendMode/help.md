## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| tex | surface | none | — | Source B texture to blend with |
| mode | int | 0 (add) | — | Blend mode (see below) |
| mixAmt | float | 0 | -100–100 | Mix amount (0 = original, positive = more blend) |

## Blend Modes

- **add** (0): Additive blending
- **burn** (1): Color burn
- **darken** (2): Darken (min)
- **diff** (3): Difference
- **dodge** (4): Color dodge
- **exclusion** (5): Exclusion
- **hardLight** (6): Hard light
- **lighten** (7): Lighten (max)
- **mix** (8): Linear mix
- **multiply** (9): Multiply
- **negation** (10): Negation
- **overlay** (11): Overlay
- **phoenix** (12): Phoenix
- **screen** (13): Screen
- **softLight** (14): Soft light
- **subtract** (15): Subtract

## Description

Blend two inputs using selectable blend mode.

## Usage

```
noise().blendMode(tex: read(o1), mode: overlay, mixAmt: 50).write(o0)
```
