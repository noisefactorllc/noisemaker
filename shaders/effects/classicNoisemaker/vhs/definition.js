import { Effect } from '../../../src/runtime/effect.js'

/**
 * VHS - bad VHS tracking effect
 */
export default new Effect({
  name: "Vhs",
  namespace: "classicNoisemaker",
  tags: ["distort"],
  func: "vhs",

  description: "VHS tape artifacts",
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
    }
  },
  passes: [
    {
      name: "main",
      program: "vhs",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        color: "outputTex"
      }
    }
  ]
})
