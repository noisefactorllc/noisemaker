# synth/remap

Polygon-zone router that pairs with the Remap projection-mapping app.

## Overview

Each pixel is tested against up to eight polygon zones. The first zone that contains the pixel decides which engine surface is sampled. Pixels outside every active zone — and pixels in zones whose source isn't wired — show the background color. Each zone has its own alpha and an edge smoothing factor blends adjacent zones smoothly.

This effect is the rendering counterpart to the [Remap web app](https://remap.noisedeck.app), which produces a portable JSON describing the zones. Apply the parameters via `applyStepParameterValues`, then wire each zone's source surface in DSL with `zoneN_tex: read(oN)`.

## Workflow

1. Open the [Remap app](https://remap.noisedeck.app), calibrate the projector, and paint your zones.
2. From the Export view's **Effect params** tab, copy the parameter object.
3. In Noisemaker, drop a `synth/remap` effect into your composition.
4. In your DSL, wire each zone's source: `remap(zone0_tex: read(o0), zone2_tex: read(o5), ...).write(o7)`.
5. Apply the polygon and warp parameters via the renderer: `applyStepParameterValues({ step_N: params })`.

The shape parameters (`zoneN_count`, `zoneN_vP`) and the warp handles (`warpCornerN`, `warpMidN`) are hidden from the UI because they're meant to be loaded as a batch from the Remap app, not edited by hand. The visible controls are background, alpha, smoothing, the warp toggle, and per-zone alpha.

## Parameters

### General
- **Zone count**: how many of the eight slots are active (0–8). Slots with `vertices < 3` or with `zoneN_tex` unwired are skipped automatically.
- **Background**: color for pixels outside every active zone.
- **Background alpha**: alpha channel for the background.
- **Edge smoothing**: soft falloff at polygon boundaries to hide aliased seams between adjacent zones.

### Warp
- **Warp enabled**: when on, every output pixel is run through the inverse of the eight-handle Coons-patch warp described by `warpCorner0..3` and `warpMid0..3` (the same handles you adjust on the Calibrate view of the Remap app). Pixels that fall outside the source rectangle render as background. The handle uniforms are populated by the Remap app's effect-params export.

### Zones (1–8)
For each zone:
- **Zone N source** (`zoneN_tex`): the engine surface to sample. Wire in DSL with `zoneN_tex: read(oN)`. When unwired (default `"none"`), the zone is skipped.
- **Alpha**: per-zone opacity.
- **Vertices** (hidden): vertex count, populated by the loader.
- **verts P–P+1** (hidden): packed `vec4` holding two vertices, populated by the loader.

## Coordinate space

Vertices are normalized: `(0, 0)` is top-left and `(1, 1)` is bottom-right. The GLSL backend flips the y axis internally so a polygon defined by the Remap app draws in the same orientation it was painted on either backend.

## Limits

- 8 zones (matches the eight engine user surfaces `o0`…`o7`)
- 16 vertices per zone

If you need more vertices per zone, decompose the polygon into multiple zones and wire them all to the same source surface.
