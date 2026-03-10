import { Effect } from '../../../src/runtime/effect.js'

/**
 * Sketch - Pencil sketch / crosshatch effect
 */
export default new Effect({
  name: "Sketch",
  namespace: "filter",
  func: "sketch",
  tags: ["edges"],

  description: "Pencil sketch with crosshatch shading",
  globals: {
    contrast: {
      type: "float",
      default: 2.0,
      uniform: "contrast",
      min: 0,
      max: 3,
      step: 0.01,
      ui: {
        label: "contrast",
        control: "slider"
      }
    },
    hatchDensity: {
      type: "float",
      default: 1.0,
      uniform: "hatchDensity",
      min: 0,
      max: 2,
      step: 0.01,
      ui: {
        label: "hatch density",
        control: "slider"
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
    }
  },
  passes: [
    {
      name: "render",
      program: "sketch",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
