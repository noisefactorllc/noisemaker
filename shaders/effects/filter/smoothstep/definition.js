import { Effect } from '../../../src/runtime/effect.js'

/**
 * nu/smoothstep - Adjustable smoothstep thresholds
 * Creates smooth transition between edge0 and edge1
 */
export default new Effect({
  name: "Smoothstep",
  namespace: "filter",
  func: "smoothstep",
  tags: ["color", "util"],

  description: "Smooth Hermite interpolation between edges",
  globals: {
    edge0: {
      type: "float",
      default: 0.0,
      uniform: "edge0",
      min: 0,
      max: 1,
      step: 0.01,
      ui: {
        label: "Edge 0",
        control: "slider"
      }
    },
    edge1: {
      type: "float",
      default: 1.0,
      uniform: "edge1",
      min: 0,
      max: 1,
      step: 0.01,
      ui: {
        label: "Edge 1",
        control: "slider"
      }
    }
  },
  passes: [
    {
      name: "render",
      program: "smoothstep",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
