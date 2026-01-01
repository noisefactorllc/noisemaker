## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| resetState | boolean | false | — | Reset button to clear feedback state |
| sharpenRadius | int | 5 | 1–10 | Kernel size for the sharpen pass |
| sharpenAmount | float | 2.5 | 0–3 | Intensity of sharpening effect |
| blurRadius | int | 4 | 1–10 | Kernel size for the blur pass |
| blurAmount | float | 0.5 | 0–1 | Mix between original and blurred (0 = no blur, 1 = full blur) |
| intensity | float | 0.55 | 0–1 | How much feedback blends into the output (0 = input only, 1 = full feedback) |

## Algorithm

1. **Sharpen**: Unsharp mask on feedback texture (selfTex)
2. **Blur**: Gaussian blur with configurable radius and amount
3. **Blend**: Mix processed feedback with current input based on intensity

The feedback loop creates evolving, time-accumulating effects.
