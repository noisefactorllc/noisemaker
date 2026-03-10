import { Effect } from '../../../src/runtime/effect.js'

/**
 * Random Tint
 * Seed-based random color tint overlay
 */
export default new Effect({
  name: "Random Tint",
  namespace: "filter",
  func: "randomTint",
  tags: ["color"],

  description: "Color tint overlay using deterministic random hue",
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
      program: "randomTint",
      inputs: {
        inputTex: "inputTex"
      },
      uniforms: {
        alpha: "alpha",
        seed: "seed"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
