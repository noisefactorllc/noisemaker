import { Effect } from '../../../src/runtime/effect.js'

/**
 * Palette
 * /shaders/effects/palette/palette.wgsl
 */
export default new Effect({
  name: "Palette",
  namespace: "classicNoisemaker",
  tags: ["color"],
  func: "palette",

  description: "Color palette application",
  globals: {
    index: {
        type: "member",
        default: "palette.afterimage",
        enum: "palette",
        uniform: "paletteIndex",
        ui: {
            label: "palette",
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
            label: "alpha",
            control: "slider"
        }
    }
},
  paramAliases: { paletteIndex: 'index' },
  passes: [
    {
      name: "main",
      program: "palette",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        color: "outputTex"
      }
    }
  ]
})
