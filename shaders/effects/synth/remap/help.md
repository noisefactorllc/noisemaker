# synth/remap

Polygon-zone router with live canvas editing in Noisedeck.

## Overview

Each pixel is tested against up to eight polygon zones. Zones stack in index order: the last (highest-numbered) zone that contains a pixel is on top, and lower zones show through wherever the zones above them are transparent. Pixels outside every active zone — and pixels in zones whose source isn't wired — show the background color.

Edge smoothing feathers each zone outward by a pixel width proportional to the shorter canvas side, so adjacent zones blend without a seam and canvas borders stay clean; a zone's interior is never eroded. Sources are composited with their alpha, so a transparent source shows the background or the zone below, and each zone has its own alpha on top of that.

In Noisedeck, edit zones directly over the live canvas from the Remap effect. Existing `.remap.json` maps can be imported, and the effect exports the same portable version 1 format.

## Workflow

1. Add Remap to your Noisedeck composition and choose **edit zones**.
2. Choose **add zone**, then click points on the live canvas. Click the first point or press Enter to finish; Escape cancels an unfinished shape.
3. In Noisedeck a newly finished zone takes the first written surface not used by another zone; change it with the zone's source control. The mapped image updates as you drag vertices. Click an edge midpoint to insert a vertex; right-click a vertex to remove it.
4. Set zone names, outline colors, and opacity in the effect controls.
5. Choose **export remap config** to save the portable map, or **import remap config** to load an existing map.

The canvas editor manages the hidden shape parameters (`zoneN_count`, `zoneN_vP`). Runtime integrations can still apply these parameters through `applyStepParameterValues({ step_N: params })` and wire source surfaces in DSL with `zoneN_tex: read(oN)`. Existing maps and hexadecimal vertex literals remain valid.

## Parameters

### General
- **Zone count**: how many of the eight slots are active (0–8). Slots with `vertices < 3` or with `zoneN_tex` unwired are skipped automatically.
- **Background**: color for pixels outside every active zone. It also shows through transparent sources and partially transparent zones.
- **Background alpha**: alpha channel for the background. The output is premultiplied, so a background alpha below 1 leaves the surface partially transparent.
- **Edge smoothing**: outward feather at polygon boundaries. At 1 the feather is 5% of the shorter canvas side wide (54 px on a 1920×1080 canvas); at the default 0.04 it is about 2 px on that same canvas. The feather only extends outward, so a zone never shrinks, shared edges never show the background, and the same value gives the same pixel width on both axes whatever the aspect ratio. Set it to 0 for hard edges.

### Zones (1–8)
For each zone:
- **Zone N source** (`zoneN_tex`): the engine surface to sample. Wire in DSL with `zoneN_tex: read(oN)`. When unwired (default `"none"`), the zone is skipped.
- **Alpha**: per-zone opacity, multiplied with the source's own alpha. Zones with a higher number are composited on top of lower ones.
- **Vertices** (hidden): vertex count, managed by canvas editing or map import.
- **verts P–P+1** (hidden): packed `vec4` holding two vertices, managed by canvas editing or map import.
- **bounds** (hidden, `zoneN_bounds`): the polygon's bounding box as `[minX, minY, maxX, maxY]` in normalized coordinates, written by the canvas editor. The shader skips the zone for pixels outside this box (dilated by the feather), which is what keeps many-vertex maps fast. The default `[0, 0, 1, 1]` never skips anything, so maps and hosts that do not supply bounds render identically, only slower; a box tighter than the polygon clips it.

## Coordinate space

Vertices are normalized: `(0, 0)` is top-left and `(1, 1)` is bottom-right. Both backends flip the y axis internally, so polygons match the canvas editor's orientation whichever one is running.

Regenerated DSL stores each packed vertex pair as four exact numbers, such as `[0.8000000780001997, 0.45, 0.1, 0.45]`. The effect's `ui.format: 'vector'` metadata preserves these coordinates through editing and saving. Legacy hexadecimal vertex literals still load, with their original 8-bit color precision.

## Limits

- 8 zones (matches the eight engine user surfaces `o0`…`o7`)
- 64 vertices per zone

If you need more than 64 vertices per zone, decompose the polygon into multiple zones and wire them all to the same source surface.

## Geometry correction (deferred)

This effect intentionally does not include software geometry correction (warping the rectangular projector output onto a non-rectangular physical surface). For now, use your projector's keystone or 4-corner correction.

A future revision may bring back an 8-handle Coons-patch warp, suitable for the cases hardware can't handle:

- curved surfaces (cylinders, columns, fabric drops)
- non-contiguous targets (one projector hitting multiple separate surfaces)
- multi-projector setups with edge feathering

When that happens, the warp will be additive: the existing zone-routing semantics will not change, and the new uniforms will be opt-in.
