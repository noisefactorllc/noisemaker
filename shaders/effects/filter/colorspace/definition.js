import { Effect } from '../../../src/runtime/effect.js'

/**
 * filter/colorspace - Reinterpret RGB as HSV, OKLab, or OKLCH
 * Treats RGB channels as colorspace values and converts to RGB
 */
export default new Effect({
  name: "Colorspace",
  namespace: "filter",
  func: "colorspace",
  tags: ["color", "util"],

  description: "Interpret RGB as HSV, OKLab, or OKLCH and convert",
  globals: {
    mode: {
      type: "int",
      default: 0,
      uniform: "mode",
      choices: {
        hsv: 0,
        oklab: 1,
        oklch: 2
      },
      ui: {
        label: "Mode",
        control: "dropdown"
      }
    }
  },
  passes: [
    {
      name: "render",
      program: "colorspace",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
