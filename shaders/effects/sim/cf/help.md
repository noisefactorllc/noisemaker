## Parameters

- **Sharpen Radius** (1-5): Kernel size for the sharpen pass
- **Sharpen Amount** (0-3): Intensity of sharpening effect
- **Blur Radius** (1-10): Kernel size for the blur pass
- **Blur Amount** (0-1): Mix between original and blurred (0 = no blur, 1 = full blur)
- **Intensity** (0-1): How much feedback blends into the output (0 = input only, 1 = full feedback)

## Algorithm

1. **Sharpen**: Unsharp mask on feedback texture (selfTex)
2. **Blur**: Gaussian blur with configurable radius and amount
3. **Blend**: Mix processed feedback with current input based on intensity

The feedback loop creates evolving, time-accumulating effects.
