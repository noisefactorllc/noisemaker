# tunnel

Perspective tunnel effect with shape options

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| shape | int | circle | circle/triangle/roundedRect/square/hexagon/octagon | Tunnel shape |
| scale | float | 0 | -1–1 | Scale offset |
| speed | int | 1 | -5–5 | Forward speed |
| rotation | int | 0 | -2–2 | Rotation speed |
| center | float | 100 | -100–100 | Center vignette (negative=darken, positive=brighten) |
| aspectLens | boolean | true | on/off | 1:1 aspect correction |
| antialias | boolean | true | on/off | 4x rotated-grid supersampling (disable before palette effects) |
