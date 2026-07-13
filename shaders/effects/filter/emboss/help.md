# emboss

Emboss relief with color convolution or an opt-in gray
directional-edge rendition.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| style | choice | color | color, gray | Select the color convolution or gray relief |
| amount | float | 1 | 0.1-5 | Color-style 3x3 convolution sample radius |
| angle | float | 135 | -360-360 | Direction from which the relief is sampled |
| height | float | 1 | 1-10 | Directional sample distance in pixels |
| colorAmount | float | 100 | Gray-style amount of source chroma retained on traced edges |

## Styles

- `color` is the default color convolution. At `angle=135, height=1` it uses
  the established 3x3 offsets and arithmetic exactly. Other angle and height
  values rotate and scale that same kernel. `amount` retains its sample-
  radius meaning in this style.
- `gray` is a bounded directional-difference rendition: uniform fill becomes neutral gray,
  while edges receive light and dark relief. `height` alone controls the
  directional sample distance. `colorAmount` retains source chroma in
  proportion to edge strength, so flat interiors stay neutral at every value.

The gray style uses a symmetric pair of luminance samples and centers their
signed difference at 50% gray. It does not claim undocumented reference-exact
coefficients.
