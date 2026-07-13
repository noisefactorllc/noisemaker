import { Effect } from '../../../src/runtime/effect.js'

/**
 * nu/inv - Invert brightness
 * mode 0 (full, default): simple luminance inversion, 1.0 - brightness
 * mode 1 (solarize): Solarize parity, min(v, 1.0 - v) per channel
 */
export default new Effect({
  name: "Invert",
  namespace: "filter",
  func: "invert",
  tags: ["color"],

  description: "Invert image luminance",
  globals: {
    mode: {
      type: "int",
      default: 0,
      uniform: "mode",
      choices: {
        full: 0,
        solarize: 1
      },
      ui: {
        label: "mode",
        control: "dropdown"
      }
    }
  },
  passes: [
    {
      name: "render",
      program: "inv",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
