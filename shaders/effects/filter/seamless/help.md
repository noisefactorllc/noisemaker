# seamless

Edge-blend cross-fade for seamless tiling. Blends opposite edges of the input texture so the output tiles without visible seams.

## Description

Applies a toroidal cross-fade: pixels near the left edge blend toward right-edge content (and vice versa), and similarly for top/bottom. The result is a texture that tiles seamlessly in both directions.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| blend | float | 0.25 | 0-0.5 | Width of the cross-fade zone as fraction of tile |
| repeat | float | 2 | 1-10 | Number of tile repetitions to display |
| curve | int | smooth | linear/smooth/cosine | Blend falloff curve |

## Notes

- Set repeat to 1 to output just the seamless tile unit (for chaining with other effects)
- Higher blend values produce smoother seams but lose more of the original edge content
- Works best when the input has some visual variation — uniform inputs don't need blending
