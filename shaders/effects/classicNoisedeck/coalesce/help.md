# coalesce

Coalescing blend effect

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| tex | surface | none | - | Source surface B |
| seed | int | 1 | 1-100 | Seed |
| blendMode | int | mix | add/alpha/brightnessAB/brightnessBA/cloak/colorBurn/colorDodge/darken/difference/exclusion/glow/hardLight/hueAB/hueBA/lighten/mix/multiply/negation/overlay/phoenix/reflect/saturationAB/saturationBA/screen/softLight/subtract | Mode |
| mixAmt | float | 0 | -100-100 | Mix |
| refractAAmt | float | 0 | 0-100 | Refract a→b |
| refractBAmt | float | 0 | 0-100 | Refract b→a |
| refractADir | float | 0 | 0-360 | Refract dir a |
| refractBDir | float | 0 | 0-360 | Refract dir b |
