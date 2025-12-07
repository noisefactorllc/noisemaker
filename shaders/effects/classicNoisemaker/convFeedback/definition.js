import { Effect } from '../../../src/runtime/effect.js';

/**
 * Conv Feedback
 * Iterative blur+sharpen feedback effect.
 * 
 * Uses selfTex (previous frame's output) for frame-by-frame accumulation.
 * Each frame applies one blur+sharpen iteration to the accumulated result.
 * The effect converges after ~100 frames.
 * 
 * Usage: search nm
 *        noise(seed: 1).convFeedback(alpha: 0.5).out(o0)
 */
export default new Effect({
  name: "ConvFeedback",
  namespace: "classicNoisemaker",
  func: "convFeedback",
  globals: {
    alpha: {
        type: "float",
        default: 0.5,
        uniform: "alpha",
        min: 0,
        max: 1,
        step: 0.01,
        ui: {
            label: "Blend Alpha",
            control: "slider"
        }
    }
  },
  textures: {
    _blurred: { width: "100%", height: "100%", format: "rgba16f" }
  },
  passes: [
    // Pass 1: Blur the input
    {
      name: "blur",
      program: "convFeedbackBlur",
      inputs: {
        inputTex: "inputTex"  // Use input, not selfTex
      },
      outputs: {
        fragColor: "_blurred"
      }
    },
    // Pass 2: Sharpen and blend with original input
    {
      name: "sharpenBlend",
      program: "convFeedbackSharpenBlend",
      inputs: {
        blurredTex: "_blurred",
        inputTex: "inputTex"    // Original input for blending
      },
      uniforms: {
        alpha: "alpha"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
});
