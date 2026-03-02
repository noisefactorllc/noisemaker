# subdivide

Recursive grid subdivision with shapes

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| tex | surface | none | - | Optional texture input |
| mode | int | binary | binary/quad | Subdivision type |
| depth | int | 4 | 1-6 | Max subdivision levels |
| density | float | 50 | 0-100 | Subdivision probability |
| seed | int | 1 | 1-100 | Random seed |
| fill | int | solid | solid/circle/diamond/square/arc/mixed | Cell fill shape |
| outline | float | 0 | 0-10 | Grid line width in pixels |
| inputMix | float | 0 | 0-100 | Blend with input texture |
