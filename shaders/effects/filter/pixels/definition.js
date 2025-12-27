import { Effect } from '../../../src/runtime/effect.js'

/**
 * nu/pixels - Pixelation effect
 * Reduces image resolution for retro pixel art look
 */
export default new Effect({
  name: "Pixels",
  namespace: "filter",
  func: "pixels",
  tags: [],

  description: "Pixelation effect for retro look",
  globals: {
    size: {
      type: "float",
      default: 4.0,
      uniform: "size",
      min: 1,
      max: 32,
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
