import { Effect } from '../../../src/runtime/effect.js'

/**
 * nu/palette - Apply cosine color palettes
 * Uses luminance to sample from one of 55 cosine palettes
 */
export default new Effect({
  name: "Palette",
  namespace: "filter",
  func: "palette",

  description: "Apply cosine color palettes based on luminance",
  globals: {
    paletteIndex: {
      type: "member",
      default: "palette.afterimage",
      enum: "palette",
      uniform: "paletteIndex",
      ui: {
        label: "Palette",
        control: "dropdown"
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
        label: "Alpha",
        control: "slider"
      }
    }
  },
  passes: [
    {
      name: "render",
      program: "palette",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
