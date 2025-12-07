import { Effect } from '../../../src/runtime/effect.js'

/**
 * Reverb
 * Simple multi-pass reverb: each iteration blends image with 50% scaled version
 */
export default new Effect({
  name: "Reverb",
  namespace: "classicNoisemaker",
  func: "reverb",

  description: "Visual reverb/echo effect",
  globals: {
    iterations: {
        type: "int",
        default: 3,
        uniform: "iterations",
        min: 1,
        max: 8,
        step: 1,
        ui: {
            label: "Iterations",
            control: "slider"
        }
    },
    ridges: {
        type: "boolean",
        default: false,
        uniform: "ridges",
        ui: {
            label: "Ridges",
            control: "checkbox"
        }
    }
},
  passes: [
    {
      name: "main",
      program: "reverb",
      inputs: {
        inputTex: "inputTex"
      },
      uniforms: {
        iterations: "iterations",
        ridges: "ridges"
      },
      outputs: {
        color: "outputTex"
      }
    }
  ]
})
