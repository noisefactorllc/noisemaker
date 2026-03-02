import { Effect } from '../../../src/runtime/effect.js'

/**
 * nu/sharpen - Sharpen convolution effect
 * Enhances image detail and edges
 */
export default new Effect({
  name: "Sharpen",
  namespace: "filter",
  func: "sharpen",
  tags: ["edges"],

  description: "Sharpen using convolution",
  globals: {
    amount: {
      type: "float",
      default: 1.0,
      uniform: "amount",
      min: 0.1,
      max: 5,
      zero: 0,
      ui: {
        label: "amount",
        control: "slider"
      }
    }
  },
  passes: [
    {
      name: "render",
      program: "sharpen",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
