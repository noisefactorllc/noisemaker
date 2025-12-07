import { Effect } from '../../../src/runtime/effect.js';

/**
 * Sobel
 * /shaders/effects/sobel/sobel.wgsl
 */
export default new Effect({
  name: "Sobel",
  namespace: "classicNoisemaker",
  func: "sobel",
  globals: {
    distMetric: {
        type: "enum",
        default: 1,
        uniform: "distMetric",
        ui: {
            label: "Distance Metric"
        }
    },
    alpha: {
        type: "float",
        default: 1,
        min: 0,
        max: 1,
        step: 0.01,
        uniform: "alpha",
        ui: {
            label: "Alpha",
            control: "slider"
        }
    }
},
  passes: [
    {
      name: "main",
      program: "sobel",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
});
