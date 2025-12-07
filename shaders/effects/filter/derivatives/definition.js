import { Effect } from '../../../src/runtime/effect.js';

/**
 * nu/derivatives - Derivative-based edge detection
 * Computes image derivatives to highlight edges
 */
export default new Effect({
  name: "Derivatives",
  namespace: "filter",
  func: "derivatives",
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
      program: "derivatives",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
});
