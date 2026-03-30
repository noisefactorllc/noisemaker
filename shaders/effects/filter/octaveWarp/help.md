# octaveWarp

Per-octave noise warp distortion

## Description

For each octave, generates noise at increasing frequencies and uses it to displace UV coordinates. Displacement decreases with each octave, building up layered organic warping. Each octave animates with a unique phase and radius to avoid uniform circular motion.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| freq | float | 2 | 1-10 | Noise frequency |
| octaves | int | 3 | 1-5 | Number of octaves |
| displacement | float | 0.2 | 0-1 | Displacement amount |
| speed | int | 1 | 0-5 | Animation speed |
| seed | int | 1 | 1-100 | Random seed for noise pattern |
| wrap | int | 0 | 0-2 | Edge wrapping (0=Mirror, 1=Repeat, 2=Clamp) |
| antialias | boolean | true | on/off | 4x rotated-grid supersampling |
