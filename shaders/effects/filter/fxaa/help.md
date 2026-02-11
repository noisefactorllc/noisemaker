# fxaa

Fast approximate anti-aliasing

Applies an edge-aware blur weighted by luminance differences. Neighboring pixels with similar luminance are blended together while edges (large luminance jumps) are preserved. Alpha is passed through unchanged.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| strength | float | 1.0 | 0-1 | Mix between original and anti-aliased output (0 = bypass, 1 = full effect) |
| sharpness | float | 1.0 | 0.1-10 | Edge sensitivity of the weight falloff. Higher values preserve edges more; lower values blur more aggressively |
| threshold | float | 0.0 | 0-1 | Minimum luminance contrast to trigger AA. Pixels with all neighbors below this contrast are left untouched |
