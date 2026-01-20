# centerMask

Blend from edges (A) into center (B) using a distance mask

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| tex | surface | none | - | Source B (center) |
| blendMode | int | mix | add/burn/darken/diff/dodge/exclusion/hardLight/lighten/mix/multiply/negation/overlay/phoenix/screen/softLight/subtract | Blend mode |
| shape | int | square | circle/diamond/square | Shape |
| hardness | float | 0 | 0-100 | Edge hardness |
| mixAmt | float | 0 | -100-100 | Mix |
