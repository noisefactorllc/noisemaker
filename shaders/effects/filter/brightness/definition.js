import { Effect } from '../../../src/runtime/effect.js';

/**
 * nu/brightness - Multiply brightness
 * Simple brightness adjustment (0..10)
 */
export default new Effect({
  name: "Brightness",
  namespace: "filter",
  func: "brightness",
  globals: {
    amount: {
      type: "float",
      default: 1,
      uniform: "amount",
      min: 0,
      max: 10,
      ui: {
        label: "amount",
        control: "slider"
      }
    }
  },
  passes: [
    {
      name: "render",
      program: "brightness",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
});
