import { Effect } from '../../../src/runtime/effect.js'

/**
 * nu/palette - Apply cosine color palettes
 * Uses luminance to sample from one of 56 cosine palettes
 */
export default new Effect({
  name: "Palette",
  namespace: "filter",
  func: "palette",
  tags: ["color", "palette"],

  description: "Apply cosine color palettes based on luminance",
  globals: {
    index: {
      type: "member",
      default: "palette.brushedMetal",
      enum: "palette",
      uniform: "paletteIndex",
      ui: {
        label: "palette",
        control: "dropdown"
      }
    },
    rotation: {
      type: "float",
      default: 0,
      uniform: "rotation",
      choices: {
        none: 0,
        fwd: 1,
        back: -1
      },
      ui: {
        label: "rotation",
        control: "dropdown"
      }
    },
    offset: {
      type: "float",
      default: 0,
      uniform: "offset",
      min: 0,
      max: 100,
      step: 1,
      ui: {
        label: "offset",
        control: "slider"
      }
    },
    repeat: {
      type: "int",
      default: 1,
      uniform: "repeat",
      min: 1,
      max: 10,
      randMax: 5,
      ui: {
        label: "repeat",
        control: "slider"
      }
    },
    alpha: {
      type: "float",
      default: 1,
      uniform: "alpha",
      min: 0,
      max: 1,
      randMin: 0.5,
      step: 0.01,
      ui: {
        label: "alpha",
        control: "slider"
      }
    }
  },
  paramAliases: { paletteIndex: 'index', paletteOffset: 'offset', paletteRepeat: 'repeat', paletteRotation: 'rotation' },
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
