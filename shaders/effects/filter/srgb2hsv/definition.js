import { Effect } from '../../../src/runtime/effect.js'

/**
 * nu/srgb2hsv - Reinterpret RGB as HSV
 * Treats RGB channels as HSV values and converts to RGB
 */
export default new Effect({
  name: "Hsv",
  namespace: "filter",
  func: "srgb2hsv",

  description: "Interpret RGB as HSV and convert",
  uniformLayout: {},
  globals: {},
  passes: [
    {
      name: "render",
      program: "hsv",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
