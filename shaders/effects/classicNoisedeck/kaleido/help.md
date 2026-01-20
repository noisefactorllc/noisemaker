# Kaleido

Kaleidoscope effect with multiple symmetry modes.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| kaleido | int | 8 | 2–32 | Number of symmetry sides |
| metric | int | 0 | circle/diamond/hexagon/octagon/square/triangle | Shape metric |
| direction | int | 2 | clockwise/counterclock/none | Rotation direction |
| loopOffset | int | 10 | circle/triangle/diamond/square/.../rings/sine | Animation loop shape |
| loopScale | float | 1 | 1–100 | Loop scale |
| loopAmp | float | 5 | -100–100 | Loop power |
| seed | int | 1 | 1–100 | Random seed |
| wrap | boolean | true | — | Enable seamless wrapping |
| kernel | int | 0 | none/blur/derivatives/derivDivide/edge/emboss/litEdge/... | Post-processing kernel |
