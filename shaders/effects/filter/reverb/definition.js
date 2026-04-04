import { Effect } from '../../../src/runtime/effect.js'

/**
 * Reverb
 * Simple multi-pass reverb: each iteration blends image with 50% scaled version
 */
export default new Effect({
  name: "Reverb",
  namespace: "filter",
  func: "reverb",
  tags: ["distort"],

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
            label: "iterations",
            control: "slider"
        }
    },
    ridges: {
        type: "boolean",
        default: false,
        uniform: "ridges",
        ui: {
            label: "ridges",
            control: "checkbox"
        }
    },
    alpha: {
        type: "float",
        default: 1.0,
        uniform: "alpha",
        min: 0,
        max: 1,
        step: 0.01,
        ui: {
            label: "alpha",
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
      randChoices: [0, 1],
      ui: {
        label: "wrap",
        control: "dropdown"
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
        ridges: "ridges",
        alpha: "alpha",
        wrap: "wrap"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
