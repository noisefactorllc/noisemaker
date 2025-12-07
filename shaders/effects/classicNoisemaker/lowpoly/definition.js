import { Effect } from '../../../src/runtime/effect.js'

/**
 * Lowpoly
 * /shaders/effects/lowpoly/lowpoly.wgsl
 */
export default new Effect({
  name: "Lowpoly",
  namespace: "classicNoisemaker",
  func: "lowpoly",

  description: "Low-polygon style render",
  globals: {
    distrib: {
        type: "enum",
        default: 1000000,
        uniform: "distrib",
        ui: {
            label: "Point Distribution"
        }
    },
    freq: {
        type: "int",
        default: 10,
        uniform: "freq",
        min: 1,
        max: 64,
        step: 1,
        ui: {
            label: "Frequency",
            control: "slider"
        }
    },
    distMetric: {
        type: "enum",
        default: 1,
        uniform: "distMetric",
        ui: {
            label: "Distance Metric"
        }
    }
},
  passes: [
    {
      name: "main",
      program: "lowpoly",
      inputs: {
        inputTex: "inputTex"
      },
      uniforms: {
        distrib: "distrib",
        freq: "freq",
        distMetric: "distMetric"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
