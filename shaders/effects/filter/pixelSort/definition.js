import { Effect } from '../../../src/runtime/effect.js'

/**
 * Pixel Sort - GPU pixel sorting glitch effect
 *
 * Two-pass pipeline:
 * 1. Prepare: Rotate by angle, optionally invert for darkest-first mode
 * 2. Sort & Finalize: Per-row threshold-based sorting, rotate back, blend
 */
export default new Effect({
  name: "Pixel Sort",
  namespace: "filter",
  func: "pixelSort",
  tags: ["distort"],

  description: "Pixel sorting glitch effect",
  globals: {
    angle: {
      type: "float",
      default: 0,
      uniform: "angle",
      min: 0,
      max: 360,
      step: 1,
      ui: {
        label: "angle",
        control: "slider"
      }
    },
    darkest: {
      type: "boolean",
      default: false,
      uniform: "darkest",
      ui: {
        label: "darkest first",
        control: "checkbox"
      }
    },
    threshold: {
      type: "float",
      default: 0.5,
      uniform: "threshold",
      min: 0,
      max: 1,
      step: 0.01,
      ui: {
        label: "threshold",
        control: "slider"
      }
    },
    alpha: {
      type: "float",
      default: 1.0,
      uniform: "alpha",
      min: 0,
      max: 1,
      step: 0.01,
      ui: {
        label: "alpha",
        control: "slider"
      }
    }
  },
  textures: {
    prepared: { width: "100%", height: "100%", format: "rgba16f" }
  },
  passes: [
    {
      name: "prepare",
      program: "prepare",
      inputs: {
        inputTex: "inputTex"
      },
      uniforms: {
        angle: "angle",
        darkest: "darkest"
      },
      outputs: {
        fragColor: "prepared"
      }
    },
    {
      name: "sortAndFinalize",
      program: "sortAndFinalize",
      inputs: {
        preparedTex: "prepared",
        inputTex: "inputTex"
      },
      uniforms: {
        angle: "angle",
        darkest: "darkest",
        threshold: "threshold",
        alpha: "alpha"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
