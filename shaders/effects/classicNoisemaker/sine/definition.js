import { Effect } from '../../../src/runtime/effect.js';

/**
 * Sine
 * /shaders/effects/sine/sine.wgsl
 */
export default new Effect({
  name: "Sine",
  namespace: "classicNoisemaker",
  func: "sine",
  globals: {
    amount: {
        type: "float",
        default: 3,
        uniform: "amount",
        min: 0,
        max: 20,
        step: 0.1,
        ui: {
            label: "Amount",
            control: "slider"
        }
    },
    rgb: {
        type: "boolean",
        default: false,
        uniform: "rgb",
        ui: {
            label: "RGB",
            control: "checkbox"
        }
    }
},
  passes: [
    {
      name: "main",
      program: "sine",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        outputBuffer: "outputTex"
      }
    }
  ]
});
