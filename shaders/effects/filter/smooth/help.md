# smooth

Anti-aliasing and edge smoothing with three modes

Three algorithms for reducing jagged edges, from subtle anti-aliasing to visible edge softening:

**MSAA** (Multi-Sample Anti-Aliasing): Supersamples each edge pixel at subpixel offsets using a rotated grid pattern, then averages the results. The radius parameter scales the sample offsets from subtle AA (low radius) to visible smoothing (high radius).

**SMAA** (Subpixel Morphological Anti-Aliasing): Detects edges via luma contrast, then searches along edges to determine their length and orientation. Blends neighboring pixels with weights that favor shorter, jaggier edges. The radius parameter controls blend intensity.

**Blur** (Edge-Selective Gaussian): Applies a Gaussian blur kernel only on edge pixels, leaving smooth areas untouched. Produces the most visible smoothing effect. The radius parameter controls the kernel size.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| type | int | 0 (msaa) | msaa=0, smaa=1, blur=2 | Smoothing algorithm |
| strength | float | 1.0 | 0-1 | Mix between original and smoothed output (0 = bypass, 1 = full effect) |
| threshold | float | 0.1 | 0-1 | Minimum luma contrast to detect edges. Higher values affect fewer pixels |
| radius | float | 2.0 | 0.5-4 | Spatial reach of the effect. Controls sample offset scale (MSAA), blend strength (SMAA), or kernel size (Blur) |
| samples | int | 4 (x4) | x2/x4/x8 | Number of subpixel samples per pixel (MSAA mode only) |
| searchSteps | int | 8 | 1-32 | Maximum distance to search along edges (SMAA mode only). Higher values handle longer edges but cost more |
