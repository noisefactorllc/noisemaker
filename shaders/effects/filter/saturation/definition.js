import { Effect } from '../../../src/runtime/effect.js';

/**
 * nu/saturation - Multiply saturation
 * Simple saturation adjustment (0..4)
 */
export default new Effect({
  name: "Saturation",
  namespace: "filter",
  func: "saturation",

  description: "Adjust image saturation",
  globals: {
    amount: {
      type: "float",
      default: 1,
      uniform: "amount",
      min: 0,
      max: 4,
      ui: {
        label: "amount",
        control: "slider"
      }
    }
  },
  passes: [
    {
      name: "render",
      program: "saturation",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
});
