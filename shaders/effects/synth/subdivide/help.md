# subdivide

Recursive grid subdivision with shapes

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| mode | int | binary | binary/quad | Subdivision type |
| depth | int | 5 | 1-6 | Max subdivision levels |
| density | float | 75 | 30-100 | Subdivision probability |
| seed | int | 69 | 1-100 | Random seed |
| fill | int | solid | solid/circle/diamond/square/arc/mixed | Cell fill shape |
| outline | float | 3 | 0-10 | Grid line width in pixels |
| tex | surface | none | - | Optional texture input |
| inputMix | float | 0 | 0-100 | Blend with input texture |
| wrap | int | mirror | mirror/repeat/clamp | Input texture coordinate wrap |
