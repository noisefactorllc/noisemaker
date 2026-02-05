import { Effect } from '../../../src/runtime/effect.js'

/**
 * Adjust Brightness
 * /shaders/effects/adjust_brightness/adjust_brightness.wgsl
 */
export default new Effect({
  name: "AdjustBrightness",
  namespace: "classicNoisemaker",
  func: "adjustBrightness",
  tags: ["color"],

  description: "Brightness adjustment",
  globals: {
    amount: {
        type: "float",
        default: 0.125,
        uniform: "amount",
        min: -1,
        max: 1,
        step: 0.01,
        ui: {
            label: "amount",
            control: "slider"
        }
    }
},
  passes: [
    {
      name: "main",
      program: "adjustBrightness",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        color: "outputTex"
      }
    }
  ]
})
