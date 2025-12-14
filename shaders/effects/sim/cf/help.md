# Convolution Feedback

Multi-pass temporal feedback effect using sharpen and blur convolutions.

Reads from the previous frame's output (selfTex), applies sharpen and blur
processing, then blends the result back with the current input. This creates
evolving feedback patterns over time.

## Parameters

- **Sharpen Radius** (1-5): Kernel size for the sharpen pass
- **Sharpen Amount** (0-3): Intensity of sharpening effect
- **Blur Radius** (1-10): Kernel size for the blur pass
- **Blur Amount** (0-1): Mix between original and blurred (0 = no blur, 1 = full blur)
- **Intensity** (0-1): How much feedback blends into the output (0 = input only, 1 = full feedback)

## Usage

```js
noise().cf().out(o0)
noise().cf({ sharpenAmount: 1.5, blurAmount: 0.5, intensity: 0.8 }).out(o0)
```

## Algorithm

1. **Sharpen**: Unsharp mask on feedback texture (selfTex)
2. **Blur**: Gaussian blur with configurable radius and amount
3. **Blend**: Mix processed feedback with current input based on intensity

The feedback loop creates evolving, time-accumulating effects.
