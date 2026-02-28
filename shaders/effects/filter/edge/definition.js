import { Effect } from '../../../src/runtime/effect.js'

/**
 * nu/edge - Edge detection using convolution kernel
 * Highlights edges in the image
 */
export default new Effect({
  name: "Edge",
  namespace: "filter",
  func: "edge",
  tags: ["edges"],

  description: "Edge detection using convolution kernel",
  globals: {
    amount: {
      type: "float",
      default: 2.0,
      uniform: "amount",
      min: 0,
      max: 10,
      randMin: 2.0,
      ui: {
        label: "amount",
        control: "slider"
      }
    }
  },
  passes: [
    {
      name: "render",
      program: "edge",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
