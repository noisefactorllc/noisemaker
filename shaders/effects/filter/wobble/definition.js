import { Effect } from '../../../src/runtime/effect.js'

/**
 * Wobble - offsets the entire frame using noise-driven jitter
 */
export default new Effect({
  name: "Wobble",
  namespace: "filter",
  func: "wobble",
  tags: ["distort"],

  description: "Wobble animation effect",
  globals: {
    speed: {
      type: "float",
      default: 1.0,
      uniform: "speed",
      min: 0,
      max: 5,
      step: 0.1,
      ui: {
        label: "speed",
        control: "slider"
      }
    },
    range: {
      type: "float",
      default: 0.1,
      uniform: "range",
      min: 0,
      max: 1,
      step: 0.01,
      ui: {
        label: "range",
        control: "slider"
      }
    }
  },
  passes: [
    {
      name: "main",
      program: "wobble",
      inputs: {
        inputTex: "inputTex"
      },
      uniforms: {
        speed: "speed",
        range: "range",
        time: "time"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
