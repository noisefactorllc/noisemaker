# edge

Edge detection with multiple kernels, sizes, and blend modes

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| kernel | int | bold | fine/bold | Edge detection kernel type |
| size | int | kernel5x5 | kernel5x5/kernel7x7 | Convolution kernel size |
| channel | int | color | color/luminance | Edge detection mode |
| amount | float | 100 | 0-500 | Edge intensity |
| invert | int | off | off/on | Invert edge result |
| threshold | float | 0 | 0-100 | Edge cutoff for line-art look |
| blend | int | normal | add/darken/difference/dodge/lighten/multiply/normal/overlay/screen | How edges combine with original |
| mix | float | 100 | 0-100 | Wet/dry blend with original |
