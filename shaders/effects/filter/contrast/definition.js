import { Effect } from '../../../src/runtime/effect.js';

/**
 * nu/contrast - Adjust contrast
 * Simple contrast adjustment (0..1 maps to 0..2x)
 */
export default new Effect({
  name: "Contrast",
  namespace: "filter",
  func: "contrast",
  globals: {
    amount: {
      type: "float",
      default: 0.5,
      uniform: "amount",
      min: 0,
      max: 1,
      ui: {
        label: "amount",
        control: "slider"
      }
    }
  },
  passes: [
    {
      name: "render",
      program: "contrast",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
});
