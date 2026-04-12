# convolutionFeedback

Convolution feedback with blur and sharpen

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| sharpenRadius | int | 5 | 1-10 | Sharpen Radius |
| sharpenAmount | float | 2.5 | 0-3 | Sharpen Amount |
| blurRadius | int | 4 | 1-10 | Blur Radius |
| blurAmount | float | 0.5 | 0-1 | Blur Amount |
| intensity | float | 0.75 | 0-1 | Feedback Intensity |
| resetState | boolean | false | - | State |

## Notes

Algorithm pipeline:
1. **Sharpen**: Unsharp mask on feedback texture
2. **Blur**: Gaussian blur with configurable radius and amount
3. **Blend**: Mix processed feedback with current input based on intensity

The feedback loop creates evolving, time-accumulating effects.
