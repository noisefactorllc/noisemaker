# Seamless Tiling Effects Design

Two new filter effects that produce seamlessly tileable output from any input texture.

## Effect 1: `seamless` — Edge-blend seamless tiler

Cross-fades the edges of the input texture so left matches right and top matches bottom. The output tiles seamlessly when repeated.

### Algorithm

Toroidal cross-fade. For each pixel at (u, v):

1. Compute blend weights from edge proximity using the blend width parameter
2. Sample the original texture at (u, v)
3. Sample wrapped positions offset by half the texture in x, y, and both
4. Bilinear blend using the edge-proximity weights

```
blend_x = smoothstep over blend width at left/right edges
blend_y = smoothstep over blend width at top/bottom edges

original  = sample(u, v)
wrapped_x = sample(u + 0.5, v)        // mod 1
wrapped_y = sample(u, v + 0.5)        // mod 1
wrapped_xy = sample(u + 0.5, v + 0.5) // mod 1

result = mix of all four based on blend_x, blend_y weights
```

If repeat > 1, the tile is repeated across the output using fract() on the scaled UVs.

### Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| blend | float | 0.25 | 0.0–0.5 | Width of cross-fade zone as fraction of tile |
| repeat | float | 2 | 1–10 | Number of tile repetitions to show |
| curve | int (dropdown) | smooth | linear/smooth/cosine | Blend falloff curve |

### Implementation

- Single pass, no internal textures
- Namespace: `filter`
- Tags: `transform`
- Files: `effects/filter/seamless/definition.js`, `glsl/seamless.glsl`, `wgsl/seamless.wgsl`

## Effect 2: `tile` — Symmetry tiler

Selects a region of the input and applies wallpaper-group symmetry operations to produce kaleidoscopic seamless patterns.

### Algorithm

For each output pixel, compute its position within the tile unit cell, then apply the inverse symmetry transformation to find where to sample the input texture. Different symmetry types fold the UV space differently (mirror, rotate, glide reflect) before sampling.

### Symmetry Types (6 core modes)

| Mode | Name | Description |
|------|------|-------------|
| 0 | mirror-x | Horizontal mirror (Rorschach) |
| 1 | mirror-xy | Mirror both axes — 4 reflected copies |
| 2 | rotate-2 | 180° rotational symmetry (p2) |
| 3 | rotate-3 | 120° rotational — triangular/hexagonal feel |
| 4 | rotate-4 | 90° rotational — square kaleidoscope |
| 5 | rotate-6 | 60° rotational — hexagonal kaleidoscope |

### Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| symmetry | int (dropdown) | 1 (mirror-xy) | 0–5 | Symmetry group |
| scale | float | 1.0 | 0.1–4.0 | Scale of source sampling region |
| offsetX | float | 0 | -1 to 1 | Pan source region horizontally |
| offsetY | float | 0 | -1 to 1 | Pan source region vertically |
| angle | float | 0 | 0–360 | Rotate source sampling region |
| repeat | float | 2 | 1–10 | Number of tile repetitions |

### Implementation

- Single pass, no internal textures
- All symmetry math is UV manipulation before a single texture sample
- Namespace: `filter`
- Tags: `transform`
- Files: `effects/filter/tile/definition.js`, `glsl/tile.glsl`, `wgsl/tile.wgsl`

### Symmetry UV Math

**mirror-x:** `u = 1.0 - abs(2.0 * fract(u * 0.5) - 1.0)`

**mirror-xy:** Apply mirror-x to both u and v independently.

**rotate-N:** Convert to polar coordinates relative to tile center, fold the angle into a sector of `2*PI/N`, then convert back to cartesian for sampling. For odd N (3), use a triangular fundamental domain; for even N (2, 4, 6), use rectangular/square sectors.

## Shared Conventions

- Both effects output RGBA with alpha = 1.0
- The `repeat` parameter at 1 outputs a single tile unit; higher values show the tiled pattern
- Both require GLSL and WGSL implementations
- Run `generate_shader_manifest.py` after adding the effect directories
