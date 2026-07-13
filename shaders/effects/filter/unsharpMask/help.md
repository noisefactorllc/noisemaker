# unsharpMask

Classic unsharp mask sharpening with radius and threshold

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| amount | float | 60 | 0-500 | Sharpening strength as a percentage; 0 disables the effect |
| radius | float | 4 | 0.5-50 | Gaussian blur radius (px) used to build the high-pass sharpening mask |
| threshold | float | 0 | 0-100 | Minimum edge contrast required before sharpening kicks in, gating flat/noisy areas out |

## Notes

- Implements the classic unsharp mask formula: `out = image + amount * (image - gaussianBlur(image, radius))`, with the correction gated by `threshold`.
- "Sharpen Edges" filter is equivalent to Unsharp Mask with a high `threshold`: only strong, high-contrast edges pass the gate and get sharpened, while smooth regions are left untouched.
