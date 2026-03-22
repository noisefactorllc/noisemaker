import { Effect } from '../../../src/runtime/effect.js'

/**
 * filter/posterize - Color posterization with gamma control
 * Reduces color levels with sRGB-aware quantization and adjustable gamma curve
 */
export default new Effect({
  name: "Posterize",
  namespace: "filter",
  func: "posterize",
  tags: ["color"],

  description: "Posterization/color reduction with gamma control",
  globals: {
    levels: {
      type: "int",
      default: 5,
      uniform: "levels",
      min: 2,
      max: 32,
      step: 1,
      ui: {
        label: "levels",
        control: "slider"
      }
    },
    gamma: {
      type: "float",
      default: 1,
      uniform: "gamma",
      min: 0.1,
      max: 3,
      step: 0.05,
      ui: {
        label: "gamma",
        control: "slider"
      }
    },
    antialias: {
      type: "boolean",
      default: true,
      uniform: "antialias",
      ui: {
        label: "antialias",
        control: "checkbox"
      }
    }
  },
  passes: [
    {
      name: "main",
      program: "posterize",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
