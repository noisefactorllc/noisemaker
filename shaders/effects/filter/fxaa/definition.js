import { Effect } from '../../../src/runtime/effect.js'

/**
 * FXAA
 * Fast Approximate Anti-Aliasing
 */
export default new Effect({
  name: "Fxaa",
  namespace: "filter",
  func: "fxaa",
  tags: ["antialiasing"],

  description: "Fast approximate anti-aliasing",
  globals: {
    strength: {
      type: "float",
      default: 1.0,
      uniform: "strength",
      min: 0,
      max: 1,
      ui: {
        label: "strength",
        control: "slider"
      }
    },
    sharpness: {
      type: "float",
      default: 1.0,
      uniform: "sharpness",
      min: 0.1,
      max: 10,
      step: 0.1,
      ui: {
        label: "sharpness",
        control: "slider"
      }
    },
    threshold: {
      type: "float",
      default: 0.0,
      uniform: "threshold",
      min: 0,
      max: 1,
      ui: {
        label: "threshold",
        control: "slider"
      }
    }
  },
  passes: [
    {
      name: "main",
      program: "fxaa",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
