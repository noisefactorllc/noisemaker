import { Effect } from '../../../src/runtime/effect.js';

/**
 * nu/emboss - Emboss convolution effect
 * Creates a raised relief appearance
 */
export default new Effect({
  name: "Emboss",
  namespace: "filter",
  func: "emboss",

  description: "Emboss effect creating raised relief appearance",
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
      program: "emboss",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
});
