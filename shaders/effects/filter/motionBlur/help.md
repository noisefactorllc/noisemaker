# Motion Blur Effect

Simple motion blur via frame blending. Mixes the current frame with the previous frame for a temporal blur effect.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| resetState | boolean | false | — | Reset button to clear motion blur state |
| amount | float | 50 | 0–100 | Motion blur intensity (0 = no blur, higher = more trailing) |

## How It Works

The effect maintains an internal feedback buffer that stores the previous frame output. Each frame blends the current input with this buffer based on the amount parameter. Higher values create longer motion trails.

The amount is internally clamped at 98% to prevent complete freeze.
