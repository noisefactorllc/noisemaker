import { Effect } from '../../../src/runtime/effect.js'

/**
 * Derivative
 * /shaders/effects/derivative/derivative.wgsl
 */
export default new Effect({
  name: "Derivative",
  namespace: "classicNoisemaker",
  func: "derivative",
  tags: ["math"],

  description: "Derivative edge detection",
  globals: {
    distMetric: {
        type: "enum",
        default: 1,
        uniform: "distMetric",
        ui: {
            label: "Distance Metric"
        }
    },
    withNormalize: {
        type: "boolean",
        default: true,
        uniform: "withNormalize",
        ui: {
            label: "Normalize",
            control: "checkbox"
        }
    },
    alpha: {
        type: "float",
        default: 1,
        uniform: "alpha",
        min: 0,
        max: 1,
        step: 0.01,
        ui: {
            label: "Alpha",
            control: "slider"
        }
    }
},
  passes: [
    {
      name: "main",
      program: "derivative",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        color: "outputTex"
      }
    }
  ]
})
