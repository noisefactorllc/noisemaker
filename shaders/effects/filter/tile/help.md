# tile

Symmetry-based kaleidoscope tiler. Applies wallpaper-group symmetry operations to produce seamlessly tileable patterns from any input.

## Description

Selects a region of the input and folds it using mirror or rotational symmetry. The output tiles seamlessly when repeated. Inspired by Terrazzo-style pattern generation.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| symmetry | int | mirror-xy | mirror-x/mirror-xy/rotate-2/rotate-3/rotate-4/rotate-6 | Symmetry group |
| scale | float | 1.0 | 0.1-4.0 | Scale of source sampling region |
| offset x | float | 0 | -1 to 1 | Pan source region horizontally |
| offset y | float | 0 | -1 to 1 | Pan source region vertically |
| angle | float | 0 | 0-360 | Rotate source sampling region |
| repeat | float | 2 | 1-10 | Number of tile repetitions to display |

## Notes

- mirror-x produces Rorschach-like bilateral symmetry
- mirror-xy reflects both axes for a four-quadrant pattern
- rotate-3 and rotate-6 produce hexagonal/triangular patterns
- Adjust offset and angle to explore different regions of the input
- Set repeat to 1 to output just the tile unit
