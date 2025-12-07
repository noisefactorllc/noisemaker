import { Effect } from '../../../src/runtime/effect.js'

/**
 * nu/sobel - Sobel edge detection effect
 * Classic Sobel operator for edge detection
 */
export default new Effect({
  name: "Sobel",
  namespace: "filter",
  func: "sobel",

  description: "Classic Sobel edge detection",
  globals: {
    amount: {
      type: "float",
      default: 1.0,
      uniform: "amount",
      min: 0.1,
      max: 5,
      ui: {
        label: "amount",
        control: "slider"
      }
    }
  },
  passes: [
    {
      name: "render",
      program: "sobel",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
