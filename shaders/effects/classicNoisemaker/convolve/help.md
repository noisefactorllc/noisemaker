# Convolve

Applies a convolution kernel filter to the image.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| Kernel Id | int | — | 800–810 | Selects the convolution kernel (800=Blur / 801=Deriv X / 802=Deriv Y / 803=Edges / 804=Emboss / 805=Invert / 806=Random / 807=Sharpen / 808=Sobel X / 809=Sobel Y / 810=Box Blur) |
| Normalize | float | — | 0–1 | Re-normalize the result after filtering |
| Alpha | float | — | 0–1 | Blend between the original image and the filtered result |
