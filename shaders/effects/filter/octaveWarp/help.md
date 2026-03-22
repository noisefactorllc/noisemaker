# octaveWarp

Per-octave noise warp distortion

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| freq | float | 2 | 1–10 | Noise frequency |
| octaves | int | 3 | 1–5 | Number of octaves |
| displacement | float | 0.2 | 0–1 | Displacement amount |
| speed | int | 1 | 0–5 | Animation speed |
| wrap | int | mirror | mirror/repeat/clamp | Edge wrapping mode |
| antialias | boolean | true | on/off | 4x rotated-grid supersampling (disable before palette effects) |
