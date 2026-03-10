import { Effect } from '../../../src/runtime/effect.js'

/**
 * VHS
 * VHS tape artifacts
 */
export default new Effect({
  name: "VHS",
  namespace: "filter",
  func: "vhs",
  tags: ["distort", "glitch"],

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
      uniforms: {
        speed: "speed"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
