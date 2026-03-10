# scanlineError

Scanline glitch effect

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| mode | int | vhs | scanline/vhs | Glitch style |
| timeOffset | float | 0 | -10-10 | Time offset |
| distortion | float | 1 | 0-3 | Horizontal displacement amount |
| noise | float | 1 | 0-3 | Noise overlay amount |
| speed | float | 1 | 0-5 | Animation speed |

## Notes

- **scanline** mode uses simplex noise with exponential thresholding for sharp glitch bursts
- **vhs** mode uses hash-based value noise with gradient gating for smoother VHS tracking artifacts
