# channelCombine

Combine separate surface inputs into R, G, B channels

## Description

Builds an RGB image from three independent sources: the **luminance** of each
wired surface drives one output channel. Red comes from the luminance of the
**red source**, green from the **green source**, blue from the **blue
source**, each scaled by its level control. The output is fully opaque.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| rTex | surface | none | - | Red source |
| gTex | surface | none | - | Green source |
| bTex | surface | none | - | Blue source |
| rLevel | float | 100 | 0-100 | Red level |
| gLevel | float | 100 | 0-100 | Green level |
| bLevel | float | 100 | 0-100 | Blue level |

## Notes

- Each channel reads its source's Rec. 709 luminance (0.2126/0.7152/0.0722), not the source's same-named channel — a source's own color never passes through directly
- An unwired source binds a blank texture, so its channel renders black
- Wire sources with `read(oN)`, e.g. `channelCombine(rTex: read(o0), gTex: read(o1), bTex: read(o2))`
