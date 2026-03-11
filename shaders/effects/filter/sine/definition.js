import { Effect } from '../../../src/runtime/effect.js'

/**
 * filter/sine - Sine wave color transform
 * Applies normalized sine curve to image channels.
 * RGB mode: distort R, G, B independently.
 * Non-RGB mode: convert to luminance, apply sine, output grayscale.
 */
export default new Effect({
  name: "Sine",
  namespace: "filter",
  func: "sine",
  tags: ["color"],

  description: "Sine wave color transform",
  globals: {
    amount: {
      type: "float",
      default: 7,
      uniform: "amount",
      min: 0,
      max: 20,
      step: 0.1,
      zero: 0,
      ui: {
        label: "amount",
        control: "slider"
      }
    },
    colorMode: {
      type: "int",
      default: 1,
      uniform: "colorMode",
      choices: {
        mono: 0,
        rgb: 1
      },
      ui: {
        label: "color mode",
        control: "dropdown"
      }
    }
  },
  passes: [
    {
      name: "render",
      program: "sine",
      inputs: {
        inputTex: "inputTex"
      },
      uniforms: {
        amount: "amount",
        colorMode: "colorMode"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
