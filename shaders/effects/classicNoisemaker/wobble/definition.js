import { Effect } from '../../../src/runtime/effect.js'

/**
 * Wobble - offsets the entire frame using noise-driven jitter
 */
export default new Effect({
  name: "Wobble",
  namespace: "classicNoisemaker",
  tags: ["transform"],
  func: "wobble",

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
        label: "Speed",
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
        time: "time"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
