import { Effect } from '../../../src/runtime/effect.js'

/**
 * nu/palette - Apply cosine color palettes
 * Uses luminance to sample from one of 56 cosine palettes
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
    paletteRotation: {
      type: "int",
      default: 0,
      uniform: "paletteRotation",
      choices: {
        none: 0,
        fwd: 1,
        back: -1
      },
      ui: {
        label: "Rotation",
        control: "dropdown"
      }
    },
    paletteOffset: {
      type: "float",
      default: 0,
      uniform: "paletteOffset",
      min: 0,
      max: 100,
      step: 1,
      ui: {
        label: "Offset",
        control: "slider"
      }
    },
    paletteRepeat: {
      type: "float",
      default: 1,
      uniform: "paletteRepeat",
      min: 0.1,
      max: 10,
      step: 0.1,
      ui: {
        label: "Repeat",
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
