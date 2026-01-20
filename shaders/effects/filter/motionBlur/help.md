# motionBlur

Simple motion blur via frame blending

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| amount | float | 50 | 0-100 | Amount |
| resetState | boolean | false | - | State |

## Notes

The effect maintains an internal feedback buffer that stores the previous frame output. Each frame blends the current input with this buffer based on the amount parameter. Higher values create longer motion trails.

The amount is internally clamped at 98% to prevent complete freeze.
