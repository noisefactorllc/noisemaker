# scatter

Random per-pixel scatter with darken/lighten/anisotropic/clumped modes (Diffuse, Spatter)

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| radius | float | 5 | 1-25 | Maximum scatter distance in pixels; each pixel samples the input at a random offset within [-radius, radius] on each axis |
| mode | int | 0 | normal:0, darkenOnly:1, lightenOnly:2, anisotropic:3, clumped:4 | normal samples at the raw random offset; darkenOnly/lightenOnly take the per-channel min/max of the source and sampled pixel (Diffuse Darken Only / Lighten Only); anisotropic projects the offset onto the direction perpendicular to the local luminance gradient so the scatter smears along edges instead of scattering isotropically (Diffuse Anisotropic), falling back to the raw offset in flat areas; clumped shares one random offset across each 3x3 pixel block, producing blocky clumps of displacement instead of per-pixel grain (Spatter) |
| smoothness | float | 0 | 0-100 | Re-blends the jittered result with a 3x3 tent blur by this fraction; 0 leaves the raw scatter untouched, higher values soften it into smoother frosted streaks (Spatter's Smoothness) |
| seed | int | 1 | 1-100 | Selects a different random scatter pattern; same statistics for any seed value, different per-pixel offsets |

## Notes

- Two passes: `scatterJitter` computes the random per-pixel offset and mode dispatch (min/max/projection/quantization), `scatterSmooth` re-blends with the tent blur.
- The jitter hash is seeded from the pixel's global (tile-aware) coordinate so the scatter field is continuous across CLI render tiles.
- Covers Diffuse (all four modes) and Spatter (Brush Strokes), plus general frosted-glass looks. Distinct from `filter/spatter`, which is an unrelated paint-splat overlay effect.
