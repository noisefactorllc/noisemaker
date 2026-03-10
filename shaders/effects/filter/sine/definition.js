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
    rgb: {
      type: "boolean",
      default: true,
      uniform: "rgb",
      ui: {
        label: "rgb",
        control: "checkbox"
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
        rgb: "rgb"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
