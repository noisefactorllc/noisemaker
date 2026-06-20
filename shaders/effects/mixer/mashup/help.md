# mixer/mashup

Posterize one control input by luminance and route each gray-level band to a different engine surface — a "mega mixer" that mashes up to eight sources together, driven by a single grayscale control.

## Overview

Mashup reads the luminance of its **input** (the `source` slot) and divides the `0…1` range into `layers` equal bands. Each band shows a different surface: the darkest band shows `layer 1`, the brightest shows the last layer. The `smoothness` control feathers each band boundary so adjacent sources cross-fade instead of meeting at a hard edge.

It is the luminance-driven cousin of [`synth/remap`](../../synth/remap): where Remap routes engine surfaces to *polygon zones*, Mashup routes them to *gray-level bands*. Like Remap, every source — including the control input — is an explicit slot wired in DSL with `read(oN)`. A band whose layer source is left unwired falls back to showing the control input.

## Usage

Mashup is a starter: wire the control into `source` and each band into its `layerN_tex` slot.

```
noise(ridges: true).write(o0)
solid(color: #ee3322).write(o1)
solid(color: #2266cc).write(o2)
gradient().write(o3)

mashup(layers: 3, source: read(o3), layer0_tex: read(o0), layer1_tex: read(o1), layer2_tex: read(o2))
  .write(o4)
```

The `source` input is only sampled for its luminance — its color never shows directly unless a band's layer source is unwired.

## Parameters

### General
- **Input** (`source`): the control surface whose luminance is posterized into bands. Wire with `source: read(oN)`.
- **Layers**: how many luminance bands to posterize the control into (2–8). With N layers the boundaries fall at `1/N, 2/N, …`. Layer slots above the current count are greyed out.
- **Smoothness**: half-width of the cross-fade applied at every band boundary, in luminance units (`0–0.5`). `0` gives hard posterized edges; larger values blend neighbouring sources together.

### Layers (1–8)
For each layer:
- **Layer N source** (`layerN_tex`): the engine surface shown in band N. Wire with `layerN_tex: read(oN)`. When unwired (default `"none"`), that band shows the control input instead.

## Notes

- Bands are sampled darkest → brightest, so reordering the wired sources reorders which luminance range each one occupies.
- The control input's luminance uses the standard `0.299 / 0.587 / 0.114` RGB weights.
- All sources are sampled at the output pixel position; wire surfaces at the same resolution as the composition.
