# morphology

Grayscale morphology dilate/erode (Maximum/Minimum)

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| mode | int | 0 | dilate:0, erode:1 | dilate takes the per-channel max over the structuring element (Maximum: bright regions expand, dark details erode away); erode takes the per-channel min (Minimum: dark regions expand) |
| radius | float | 4 | 1-32 | Structuring element size in pixels |
| shape | int | 0 | square:0, round:1 | square uses a separable box structuring element (sharp corners); round uses a disc structuring element capped at radius 12 (rounded corners) |

## Notes

- square shape is computed as two separable 1D passes (horizontal then vertical) since min/max over a box region is separable; round shape is computed as a single full 2D disc pass since min/max over a disc is not separable.
- The round shape's structuring element radius is capped at 12px regardless of the `radius` value, to bound the per-pixel tap count; the square shape uses the full `radius` (up to 32px).
- Maximum and Minimum filters are the same per-channel dilate/erode operator; `mode` switches between them.
