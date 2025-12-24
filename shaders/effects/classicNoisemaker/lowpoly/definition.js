import { Effect } from '../../../src/runtime/effect.js'

/**
 * Lowpoly
 * /shaders/effects/lowpoly/lowpoly.wgsl
 */
export default new Effect({
  name: "Lowpoly",
  namespace: "classicNoisemaker",
  func: "lowpoly",
  tags: ["geometric"],

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
    shape: {
        type: "enum",
        default: 1,
        uniform: "distMetric",
        ui: {
            label: "shape"
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
        shape: "distMetric"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
