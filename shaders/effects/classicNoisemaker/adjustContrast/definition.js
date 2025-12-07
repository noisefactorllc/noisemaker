import { Effect } from '../../../src/runtime/effect.js';

/**
 * Adjust Contrast
 * /shaders/effects/adjust_contrast/adjust_contrast.wgsl
 */
export default new Effect({
  name: "AdjustContrast",
  namespace: "classicNoisemaker",
  func: "adjustContrast",

  description: "Contrast adjustment",
  globals: {
    amount: {
        type: "float",
        default: 1.25,
        uniform: "amount",
        min: 0,
        max: 5,
        step: 0.05,
        ui: {
            label: "Amount",
            control: "slider"
        }
    }
},
  passes: [
    {
      name: "main",
      program: "adjustContrast",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        color: "outputTex"
      }
    }
  ]
});
