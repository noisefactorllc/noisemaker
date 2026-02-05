import { Effect } from '../../../src/runtime/effect.js'

/**
 * Tint
 * /shaders/effects/tint/tint.wgsl
 */
export default new Effect({
  name: "Tint",
  namespace: "classicNoisemaker",
  tags: ["color"],
  func: "tint",

  description: "Color tint overlay",
  globals: {
    alpha: {
        type: "float",
        default: 0.5,
        uniform: "alpha",
        min: 0,
        max: 1,
        step: 0.01,
        ui: {
            label: "alpha",
            control: "slider"
        }
    },
    seed: {
        type: "int",
        default: 1,
        uniform: "seed",
        min: 1,
        max: 100,
        ui: {
            label: "seed",
            control: "slider"
        }
    }
},
  passes: [
    {
      name: "main",
      program: "tint",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        color: "outputTex"
      }
    }
  ]
})
