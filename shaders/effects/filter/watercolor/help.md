# watercolor

Simplified color washes with pigment pooling at edges and paper granulation.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| detail | float | 50 | 0-100 | Inverse simplify radius: lower values sample the median network at a wider pixel stride, producing coarser, larger washes; higher values stay closer to a tight 1px median |
| shadowIntensity | float | 40 | 0-100 | Strength of the dark pigment pooling applied along simplified-region boundaries |
| paperTexture | float | 30 | 0-100 | Strength of the paper grain warm tint mixed into the result |

## Notes

- Implements a simplified take on Watercolor filter: a windowed-median wash simplification (same 3x3 sort network as `filter/median`, sampled at a `detail`-scaled stride) followed by edge-seeking pigment pooling, paper granulation, and a warm paper tint.
- Three-pass topology: `wcSeed` copies the source into a `global_wc_state` ping-pong surface; `wcSimplify` runs twice (fixed `repeat: 2`), each iteration re-applying the stride median network to the previous iteration's result; `wcComposite` reads the simplified washes plus the original source and builds the final look.
- Pigment pooling darkens color by up to `shadowIntensity / 100 * 0.7` where the simplified-texture gradient magnitude is high (region boundaries), using a `smoothstep(0.05, 0.4, edge)` falloff.
- Paper granulation mixes between flat (no grain) and a `0.92-1.0` value-noise field (tile-aware integer pixel coordinates) by `paperTexture / 100`, then mixes the result toward a warm tint (`vec3(1.02, 1.0, 0.95)`) by the same `paperTexture / 100` -- so `paperTexture = 0` is a smooth, untinted wash and `paperTexture = 100` is full grain plus full tint.
- A subtle "wash lift" brightens and slightly desaturates flat regions (low gradient magnitude) using the same `edge` value with an inverted falloff, over its own `smoothstep(0.0, 0.15, edge)` band -- narrower than pigment pooling's `smoothstep(0.05, 0.4, edge)` band, so the two ramps overlap but are not identical -- the complement of the pigment pooling darkening, so flats and pooled edges read as opposite ends of one continuum.
- Alpha is passed through from the source image unchanged.
