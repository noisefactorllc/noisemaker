import { Effect } from '../../../src/runtime/effect.js'

/**
 * filter/hs - Hue and Saturation
 * Combined hue rotation and saturation adjustment
 */
export default new Effect({
  name: "HS",
  namespace: "filter",
  func: "hs",
  tags: ["color", "util"],

  description: "Adjust hue and/or saturation",
  globals: {
    rotation: {
      type: "float",
      default: 0,
      uniform: "rotation",
      min: -180,
      max: 180,
      ui: {
        label: "Hue Rotation",
        control: "slider"
      }
    },
    hueRange: {
      type: "float",
      default: 100,
      uniform: "hueRange",
      min: 0,
      max: 200,
      ui: {
        label: "Hue Range",
        control: "slider"
      }
    },
    saturation: {
      type: "float",
      default: 1,
      uniform: "saturation",
      min: 0,
      max: 4,
      ui: {
        label: "Saturation",
        control: "slider"
      }
    }
  },
  passes: [
    {
      name: "render",
      program: "hs",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
