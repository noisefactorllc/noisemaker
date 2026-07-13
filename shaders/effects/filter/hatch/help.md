# hatch

Hand-drawn sketch engine covering Graphic Pen, Charcoal, Chalk & Charcoal, Conte Crayon, Crosshatch, and Colored Pencil filters

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|--------------|
| mode | int | pen | pen/charcoal/chalkCharcoal/conte/crosshatch/coloredPencil | Sketch style (see Modes below) |
| strokeLength | float | 50 | 0-100 | Stroke fiber length; maps to a noise stretch of 4-40px (short choppy marks at 0, long strokes at 100) |
| direction | int | rightDiag | rightDiag/horizontal/leftDiag/vertical | Stroke angle: 45/0/135/90 degrees |
| balance | float | 50 | 0-100 | Shadow/highlight tone threshold shift |
| pressure | float | 50 | 0-100 | Per-mode stroke weight (coverage/darkness/contrast - see Modes) |
| inkColor | color | (0.1, 0.1, 0.1) | - | Dark stroke tone; used by pen/charcoal/chalkCharcoal/conte |
| paperColor | color | (0.96, 0.94, 0.88) | - | Light background tone; used by every mode except crosshatch |

## Modes

- **pen** (default) -- Graphic Pen: `ink = step(s, 1-t)` at a single stroke angle, tonemapped straight to ink/paper - the starkest, most binary mode.
- **charcoal** -- Charcoal: a rougher 2-octave stroke noise inks only the shadow region (tone below ~0.55, softly gated), paper elsewhere; `pressure` scales both ink coverage and how dark the ink itself reads.
- **chalkCharcoal** -- Chalk & Charcoal: a mid-gray paper base with dark charcoal strokes at the stroke angle filling the shadows and paper-colored chalk strokes at angle+90 filling the highlights; `pressure` sharpens (or softens) both stroke gates' edges.
- **conte** -- Conte Crayon: a two-level dark/light remap whose midtone band is filled with fbm-textured stroke noise instead of a flat gradient.
- **crosshatch** -- Crosshatch: COLOR-PRESERVING. Keeps the source image's own color and multiplies in up to 3 stroke fields (angle, angle+45, angle-45), each gated to a progressively darker tone band so shadows accumulate more crossing hatch layers than midtones; `pressure` is the darkness gain of each layer.
- **coloredPencil** -- Colored Pencil: COLOR-PRESERVING. Image color shows through only inside the stroke mask (paper shows between strokes); mask density follows tone (denser in shadow) and bends to follow local image contours near strong edges; `pressure` is the overall stroke coverage.

## Notes

- Single pass on global (tile-aware) pixel coordinates so the stroke pattern is continuous across CLI render tiles.
- Every mode shares one stroke field, `strokeField(gc, angle, stretch) = vnoise(rotate(gc, angle) * vec2(1/stretch, 0.9))`: the along-stroke axis varies slowly (over `stretch` pixels) while the cross-stroke axis stays near full-pixel frequency, so the noise reads as thin direction-aligned fibers rather than a blob.
- `mode` is a compile-time selector (like `filter/oilPaint`'s `mode`): each value compiles as its own shader variant.
- crosshatch and coloredPencil are the only two color-preserving modes; the other four fully replace the image with an ink/paper tonemap.
