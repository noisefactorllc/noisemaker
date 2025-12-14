import { Effect } from '../../../src/runtime/effect.js'

/**
 * nu/srgb2oklab - Reinterpret RGB channels as OKLab
 * Treats RGB channels as OKLab values and converts to RGB
 */
export default new Effect({
  name: "Oklab",
  namespace: "filter",
  func: "srgb2oklab",
  tags: ["color", "util"],

  description: "Interpret RGB as OKLab and convert",
  uniformLayout: {},
  globals: {},
  passes: [
    {
      name: "render",
      program: "oklab",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
