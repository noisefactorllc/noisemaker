import { Effect } from '../../../src/runtime/effect.js'

/**
 * nu/pixels - Pixelation effect
 * Reduces image resolution for retro pixel art look
 */
export default new Effect({
  name: "Pixels",
  namespace: "filter",
  func: "pixels",
  tags: ["pixel"],

  description: "Pixelation effect for retro look",
  globals: {
    size: {
      type: "int",
      default: 16,
      uniform: "size",
      min: 1,
      max: 256,
      zero: 1,
      ui: {
        label: "size",
        control: "slider"
      }
    }
  },
  passes: [
    {
      name: "render",
      program: "pixels",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
