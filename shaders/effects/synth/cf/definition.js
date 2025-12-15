import { Effect } from '../../../src/runtime/effect.js'

/**
 * nu/cf - Convolution Feedback
 *
 * Multi-pass sharpen + blur feedback effect.
 * Blends the processed result with previous frame output for temporal feedback.
 *
 * Uses internal surfaces for feedback, not user surfaces.
 * Configurable kernel sizes and amounts for both operations.
 */
export default new Effect({
  name: "Cf",
  func: "cf",
  tags: ["util", "sim"],

  description: "Convolution feedback with blur and sharpen",
  globals: {
    tex: {
      type: "surface",
      default: "inputTex",
      ui: { label: "texture" }
    },
    resetState: {
      type: "boolean",
      default: false,
      uniform: "resetState",
      ui: {
        control: "button",
        buttonLabel: "reset",
        label: "state"
      }
    },
    sharpenRadius: {
      type: "int",
      default: 5,
      uniform: "sharpenRadius",
      min: 1,
      max: 5,
      step: 1,
      ui: {
        label: "Sharpen Radius",
        control: "slider"
      }
    },
    sharpenAmount: {
      type: "float",
      default: 2.5,
      uniform: "sharpenAmount",
      min: 0,
      max: 3,
      step: 0.1,
      ui: {
        label: "Sharpen Amount",
        control: "slider"
      }
    },
    blurRadius: {
      type: "int",
      default: 4,
      uniform: "blurRadius",
      min: 1,
      max: 10,
      step: 1,
      ui: {
        label: "Blur Radius",
        control: "slider"
      }
    },
    blurAmount: {
      type: "float",
      default: 0.5,
      uniform: "blurAmount",
      min: 0,
      max: 1,
      step: 0.01,
      ui: {
        label: "Blur Amount",
        control: "slider"
      }
    },
    intensity: {
      type: "float",
      default: 0.55,
      uniform: "intensity",
      min: 0,
      max: 1,
      step: 0.01,
      ui: {
        label: "Feedback Intensity",
        control: "slider"
      }
    }
  },
  textures: {
    _cfSharpened: {
      width: "input",
      height: "input",
      format: "rgba8unorm"
    },
    _cfBlurred: {
      width: "input",
      height: "input",
      format: "rgba8unorm"
    }
  },
  passes: [
    // Pass 1: Sharpen the feedback texture (selfTex from previous frame)
    {
      name: "sharpen",
      program: "cfSharpen",
      inputs: {
        inputTex: "selfTex"
      },
      outputs: {
        fragColor: "_cfSharpened"
      }
    },
    // Pass 2: Blur the sharpened result
    {
      name: "blur",
      program: "cfBlur",
      inputs: {
        inputTex: "_cfSharpened"
      },
      outputs: {
        fragColor: "_cfBlurred"
      }
    },
    // Pass 3: Blend processed feedback with input
    {
      name: "blend",
      program: "cfBlend",
      inputs: {
        inputTex: "tex",
        feedbackTex: "_cfBlurred"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
