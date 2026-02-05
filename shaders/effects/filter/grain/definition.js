import { Effect } from '../../../src/runtime/effect.js'

/**
 * Grain
 * Film grain overlay
 */
export default new Effect({
  name: "Grain",
  namespace: "filter",
  func: "grain",
  tags: ["noise"],

  description: "Film grain overlay",
  globals: {
    alpha: {
        type: "float",
        default: 0.25,
        uniform: "alpha",
        min: 0,
        max: 1,
        step: 0.01,
        ui: {
            label: "alpha",
            control: "slider"
        }
    },
    pause: {
        type: "boolean",
        default: false,
        uniform: "pause",
        ui: {
            label: "pause",
            control: "checkbox"
        }
    }
  },
  passes: [
    {
      name: "main",
      program: "grain",
      inputs: {
        inputTex: "inputTex"
      },
      uniforms: {
        alpha: "alpha",
        pause: "pause"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
