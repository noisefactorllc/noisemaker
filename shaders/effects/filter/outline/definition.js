import { Effect } from '../../../src/runtime/effect.js';

/**
 * nu/outline - Sobel-based outline effect
 * Subtracts edge detection from original for outline effect
 */
export default new Effect({
  name: "Outline",
  namespace: "filter",
  func: "outline",
  globals: {
    amount: {
      type: "float",
      default: 1.0,
      uniform: "amount",
      min: 0.1,
      max: 5,
      ui: {
        label: "amount",
        control: "slider"
      }
    }
  },
  passes: [
    {
      name: "render",
      program: "outline",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
});
