# extrude

Break the image into 3D blocks or pyramids projecting toward the viewer (Extrude)

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|--------------|
| type | int | blocks | blocks/pyramids | Block shape: flat-topped rectangular blocks or 4-sided pyramids |
| size | float | 24 | 4-128 | Grid cell size in pixels |
| depth | float | 30 | 0-100 | Extrusion strength; 0 collapses every cell's scale factor to 1 (see Notes) |
| depthSource | int | luminance | luminance/random | Per-cell height: sampled image brightness, or a stable per-cell random value |
| solidFront | boolean | true | on/off | Front (top / pyramid) faces show the cell's flat mean color instead of the source image |

## Notes

The image is divided into a `size`x`size` pixel grid, anchored at the image center (the same center the extrusion perspective radiates from). Each cell gets a height `h` in `[0,1]` - either the luminance of a small 3x3 average sample at the cell center (`depthSource: luminance`), or a stable hash of the cell's grid index (`depthSource: random`, unrelated to the image content). Height maps to a scale factor `s = 1 + h*(depth/100)*0.4` (`s` ranges `1..1.4` at `depth: 100`).

**blocks**: each cell's square footprint, scaled by `s` about the fixed image center, becomes its projected top face - both its offset from center and its own size grow with `s`, so taller cells shift outward *and* enlarge, producing a "leaning toward the viewer" perspective that is strongest near the frame edges. Between a cell's original footprint and its projected top face is the side band, always flat-shaded with the cell's mean color (never maps image content onto a block's sides).

**pyramids**: only the apex (the cell center, scaled by `s` about the image center) projects; the 4 side faces are triangles fanned from the original footprint's corners to that single apex point. Every visible pixel is on a slanted face, so faces are always shaded (see `solidFront`), fading from full brightness at the (undisplaced) base edge to each face's characteristic shade at the tip.

For a given pixel, occlusion is resolved by walking from the pixel's own cell toward the image center (up to 6 candidate cells - only cells at or nearer the center can ever project far enough to reach a pixel, since scaling about the center only ever moves a face *outward*). Any top-face hit beats any side-band hit; among same-tier hits, the candidate with the highest `s` (tallest / nearest the viewer) wins.

`solidFront` toggles each face's base color between the cell's flat mean color and the source image resampled at the un-projected position (a "window" back onto the original picture, warped by the same scale/fan math used to place the face). Side faces on **blocks** are always the flat mean color regardless of `solidFront`; only the top face changes. On **pyramids**, `solidFront` changes the base color of all 4 faces, which remain shaded either way.

`depth: 0` sets every cell's scale factor to `s = 1`, so blocks' top faces exactly reproduce their own footprint. With `solidFront: false` this is a bit-exact passthrough. With the shipped default `solidFront: true`, `depth: 0` is **not** a passthrough - it settles into flat per-cell mean-color posterization (comparable to a Mosaic filter), which is the intended resting state at defaults, not a bug. Pyramids have no flat-top tier at any depth (the apex degenerates to the exact cell center at `depth: 0`, splitting each cell into 4 equal corner-to-center triangles), so `depthSource: 0` pyramids always show a faceted per-cell gradient, even at `depth: 0`.
