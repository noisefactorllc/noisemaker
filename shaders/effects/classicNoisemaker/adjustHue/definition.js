import { Effect } from '../../../src/runtime/effect.js';

/**
 * Adjust Hue
 * /shaders/effects/adjust_hue/adjust_hue.wgsl
 */
export default new Effect({
  name: "AdjustHue",
  namespace: "classicNoisemaker",
  func: "adjustHue",
  globals: {
    amount: {
        type: "float",
        default: 0.25,
        uniform: "amount",
        min: -1,
        max: 1,
        step: 0.01,
        ui: {
            label: "Amount",
            control: "slider"
        }
    }
},
  passes: [
    {
      name: "main",
      program: "adjustHue",
      inputs: {
        inputTex: "inputTex"
      },
      uniforms: {
        amount: "amount"
      },
      outputs: {
        color: "outputTex"
      }
    }
  ]
});
