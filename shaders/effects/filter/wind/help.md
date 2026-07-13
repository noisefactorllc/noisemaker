# wind

Soft horizontal streaks drawn from bright image structure.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| method | int | 1 | wind:0, blast:1, stagger:2 | wind tapers quickly, blast makes a broader dense trail, and stagger continuously varies the run phase between neighboring scanlines |
| direction | int | 0 | fromLeft:0, fromRight:1 | Side the wind blows from; trails extend toward the opposite side |
| strength | float | 90 | 0-100 | Trail reach and blend amount, up to 128 pixels; zero leaves the source unchanged |
| threshold | float | 10 | 0-100 | Required luminance contrast between a trail source and the current pixel |

## Notes

- A weighted scanline integration carries brighter source color downwind. It does not use random row or segment masks.
- The contrast threshold has a smooth transition, and a final distance envelope fades every trail before its reach boundary.
- Stagger uses a continuous scanline phase instead of discrete row bands, avoiding horizontal seams.
- The source alpha is preserved.
