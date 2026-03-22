import { Effect } from '../../../src/runtime/effect.js'

/**
 * Wobble - offsets the entire frame using noise-driven jitter
 */
export default new Effect({
  name: "Wobble",
  namespace: "filter",
  func: "wobble",
  tags: ["transform"],

  description: "Wobble animation effect",
  globals: {
    speed: {
      type: "float",
      default: 5.0,
      uniform: "speed",
      min: 0,
      max: 5,
      step: 0.1,
      zero: 0,
      ui: {
        label: "speed",
        control: "slider"
      }
    },
    range: {
      type: "float",
      default: 0.5,
      uniform: "range",
      min: 0,
      max: 5,
      step: 0.05,
      ui: {
        label: "range",
        control: "slider"
      }
    },
    wrap: {
      type: "int",
      default: 0,
      uniform: "wrap",
      choices: {
        mirror: 0,
        repeat: 1,
        clamp: 2
      },
      ui: {
        label: "wrap",
        control: "dropdown"
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
        time: "time",
        wrap: "wrap"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
