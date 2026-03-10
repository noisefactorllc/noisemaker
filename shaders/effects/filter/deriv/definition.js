import { Effect } from '../../../src/runtime/effect.js'

/**
 * nu/derivatives - Derivative-based edge detection
 * Computes image derivatives to highlight edges
 */
export default new Effect({
  name: "Deriv",
  namespace: "filter",
  func: "deriv",
  tags: ["edges"],

  description: "Derivative-based edge detection",
  globals: {
    amount: {
      type: "float",
      default: 2.0,
      uniform: "amount",
      min: 0.1,
      max: 5,
      randMin: 1.0,
      ui: {
        label: "amount",
        control: "slider"
      }
    }
  },
  passes: [
    {
      name: "render",
      program: "deriv",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
