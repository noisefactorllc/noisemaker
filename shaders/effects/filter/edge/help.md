# edge

Edge detection with multiple kernels, sizes, and blend modes

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| kernel | int | bold | fine/bold/contour | Edge detection kernel type |
| level | float | 50 | 0-100 | Contour trace level (percent); used by the contour kernel only |
| contourSide | int | lower | lower/upper | Side of the level crossing marked by the contour kernel |
| size | int | kernel5x5 | kernel5x5/kernel7x7 | Convolution kernel size; used by fine and bold only |
| channel | int | color | color/luminance | Edge detection mode |
| amount | float | 100 | 0-500 | Edge intensity |
| invert | int | off | off/on | Invert edge result |
| threshold | float | 0 | 0-100 | Edge cutoff for line-art look |
| blend | int | normal | add/darken/difference/dodge/lighten/multiply/normal/overlay/screen | How edges combine with original |
| mix | float | 100 | 0-100 | Wet/dry blend with original |

## Notes

- The `contour` kernel traces classic Trace Contour iso-lines against
  the 4 cardinal neighbors. `lower` marks only the below-level pixel at a
  crossing; `upper` marks only the above-level pixel. Marked pixels are dark
  (0.0), unmarked pixels are white (1.0), matching the fine/bold kernels'
  convention of feeding a raw signal into the shared amount/threshold/invert/
  blend/mix stages. `level` and `contourSide` are exposed only for contour;
  `size` is exposed only for fine and bold.
