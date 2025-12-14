import { Effect } from '../../../src/runtime/effect.js'

/**
 * nu/hue - Rotate hue
 * Simple hue rotation effect (0..1 maps to full rotation)
 */
export default new Effect({
  name: "Hue",
  namespace: "filter",
  func: "hue",
  tags: ["color"],

  description: "Rotate image hue",
  globals: {
    rotation: {
      type: "float",
      default: 0,
      uniform: "rotation",
      min: 0,
      max: 360,
      ui: {
        label: "Rotation",
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
    }
  },
  passes: [
    {
      name: "render",
      program: "hue",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
