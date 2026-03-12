import { Effect } from '../../../src/runtime/effect.js'

/**
 * filter/hs - Hue and Saturation
 * Combined hue rotation and saturation adjustment
 */
export default new Effect({
  name: "HS",
  namespace: "filter",
  func: "hs",
  tags: ["color"],
  hidden: true,
  deprecatedBy: "adjust",

  description: "Deprecated: use 'adjust' instead. Adjust hue and/or saturation",
  globals: {
    rotation: {
      type: "float",
      default: 0,
      uniform: "rotation",
      min: -180,
      max: 180,
      ui: {
        label: "hue rotation",
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
        label: "hue range",
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
        label: "saturation",
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
