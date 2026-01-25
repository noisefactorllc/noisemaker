import { Effect } from '../../../src/runtime/effect.js'

/**
 * filter/bc - Brightness and Contrast
 * Combined brightness and contrast adjustment
 */
export default new Effect({
  name: "BC",
  namespace: "filter",
  func: "bc",
  tags: ["color"],

  description: "Adjust brightness and/or contrast",
  globals: {
    brightness: {
      type: "float",
      default: 1,
      uniform: "brightness",
      min: 0,
      max: 10,
      ui: {
        label: "Brightness",
        control: "slider"
      }
    },
    contrast: {
      type: "float",
      default: 0.5,
      uniform: "contrast",
      min: 0,
      max: 1,
      ui: {
        label: "Contrast",
        control: "slider"
      }
    }
  },
  passes: [
    {
      name: "render",
      program: "bc",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
