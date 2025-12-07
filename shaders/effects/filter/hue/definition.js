import { Effect } from '../../../src/runtime/effect.js'

/**
 * nu/hue - Rotate hue
 * Simple hue rotation effect (0..1 maps to full rotation)
 */
export default new Effect({
  name: "Hue",
  namespace: "filter",
  func: "hue",

  description: "Rotate image hue",
  globals: {
    amount: {
      type: "float",
      default: 0,
      uniform: "amount",
      min: 0,
      max: 1,
      ui: {
        label: "Amount",
        control: "slider"
      }
    }
  },
  passes: [
    {
      name: "render",
      program: "hue",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
