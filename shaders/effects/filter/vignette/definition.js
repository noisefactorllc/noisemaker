import { Effect } from '../../../src/runtime/effect.js'

/**
 * nu/vignette - Radial vignette with brightness blend
 */
export default new Effect({
  name: "Vignette",
  namespace: "filter",
  func: "vignette",
  tags: ["lens"],

  description: "Radial vignette darkening edges",
  globals: {
    brightness: {
      type: "float",
      default: 0,
      uniform: "vignetteBrightness",
      min: 0,
      max: 1,
      step: 0.01,
      ui: {
        label: "brightness",
        control: "slider"
      }
    },
    alpha: {
      type: "float",
      default: 1,
      uniform: "alpha",
      min: 0,
      max: 1,
      step: 0.01,
      ui: {
        label: "alpha",
        control: "slider"
      }
    }
  },
  passes: [
    {
      name: "render",
      program: "vignette",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
