# pondRipples

Concentric ripple distortion around the image center

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| amount | float | 30 | 0-100 | Ripple strength; 0 is a no-op and 100 reaches twice the former maximum displacement |
| ridges | int | 8 | 1-20 | Number of concentric ripple rings from center to edge |
| speed | int | 0 | -5-5 | Animation speed in wave cycles per loop; positive travels outward, negative inward, 0 is static |
| style | int | pondRipples | aroundCenter/outFromCenter/pondRipples | Displacement style |
| wrap | int | mirror | mirror/repeat/clamp | Edge behavior for samples displaced past the image bounds |
| antialias | boolean | true | on/off | 4x rotated-grid supersampling (disable before palette effects) |

## Notes

Aspect-corrected polar distortion about the fixed image center (0.5, 0.5). For each pixel, `r` is its aspect-corrected distance from center and `phase = r * ridges * 2*PI - time * 2*PI * speed` drives a damped sine wave `w = sin(phase) * amountGain * 0.05 * (1 - r)` (the `(1 - r)` term fades the ripple out toward the frame edge). Because `speed` is an integer number of wave cycles per normalized time loop, the animation loops seamlessly; at `speed = 0` the phase term vanishes and the effect is static, with `w` exactly 0 at the center since `sin(0) = 0`. The gain follows the original linear response through the default amount of 30, then rises smoothly to 2.0 at amount 100.

- **aroundCenter** rotates each sample's angular position by `w * 2*PI*0.25`, leaving its radius unchanged - a tangential swirl that traces concentric rings.
- **outFromCenter** adds `w` to each sample's radius, leaving its angle unchanged - a radial compression/expansion ripple.
- **pondRipples** applies both at half strength simultaneously, combining tangential and radial displacement into a diagonal ripple - the closest match to water rings from a dropped stone.

Wrap mode and antialiasing follow `filter/pinch`'s conventions exactly.
