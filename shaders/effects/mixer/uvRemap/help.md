# uvRemap

Remap UVs of one input using color channels of another

## Description

Uses the color channels of one input as UV coordinates to sample the other input. This creates distortion, displacement, and feedback effects by treating pixel color values as texture lookup coordinates. The map source provides the UV data, the other source is sampled at those remapped coordinates.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| tex | surface | none | - | Source B |
| mapSource | int | sourceA | sourceA/sourceB | Which input provides the UV map |
| channel | int | redGreen | redGreen/redBlue/greenBlue | Which color channels to use as U and V |
| scale | float | 100 | 0-200 | UV scale as percentage (100 = identity mapping) |
| offset | float | 0 | -1-1 | Offset applied to remapped UVs |
| wrap | int | mirror | clamp/mirror/repeat | How to handle UVs outside 0-1 range |

## Notes

- **scale at 100**: Color values map directly to UV coordinates (red=U, green=V for rg mode)
- **scale below 100**: Compresses the UV range, zooming into a portion of the sampled texture
- **scale above 100**: Expands the UV range, stretching and repeating the sampled texture
- **offset**: Shifts the entire UV mapping, useful for centering or biasing the remap
- **clamp wrap**: UVs outside 0-1 stick to the edge pixels
- **mirror wrap**: UVs ping-pong back when they exceed 0-1 boundaries
- **repeat wrap**: UVs tile seamlessly using fractional wrapping
- **channel selection**: Choose which pair of RGB channels encode the U and V coordinates. Different channels from the same source create different displacement patterns
- Feed a gradient or noise generator into one input to create controlled displacement patterns
- Chain with feedback effects for evolving, self-modifying distortions
