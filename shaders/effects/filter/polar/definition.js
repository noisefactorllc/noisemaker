import { Effect } from '../../../src/runtime/effect.js'

/**
 * nu/polar - Polar and vortex coordinate transforms
 */
export default new Effect({
  name: "Polar",
  namespace: "filter",
  func: "polar",
  tags: ["distort"],

  description: "Polar and vortex coordinate transforms",
  globals: {
    mode: {
      type: "int",
      default: 0,
      uniform: "polarMode",
      choices: {
        polar: 0,
        vortex: 1
      },
      ui: {
        label: "mode",
        control: "dropdown"
      }
    },
    scale: {
      type: "float",
      default: 0,
      uniform: "polarScale",
      min: -2,
      max: 2,
      step: 0.1,
      ui: {
        label: "scale",
        control: "slider"
      }
    },
    rotation: {
      type: "float",
      default: 0,
      uniform: "polarRotation",
      min: -2,
      max: 2,
      step: 0.1,
      ui: {
        label: "rot speed",
        control: "slider"
      }
    },
    speed: {
      type: "float",
      default: 0,
      uniform: "polarSpeed",
      min: -2,
      max: 2,
      step: 0.1,
      ui: {
        label: "polar speed",
        control: "slider"
      }
    }
  },
  passes: [
    {
      name: "render",
      program: "polar",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
