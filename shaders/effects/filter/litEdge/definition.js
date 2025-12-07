import { Effect } from '../../../src/runtime/effect.js'

/**
 * nu/litEdge - Lit edge detection effect
 * Combines edge detection with original image for lit edges
 */
export default new Effect({
  name: "LitEdge",
  namespace: "filter",
  func: "litEdge",

  description: "Edge detection combined with original for lit edges",
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
      program: "litEdge",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
