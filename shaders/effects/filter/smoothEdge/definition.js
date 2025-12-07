import { Effect } from '../../../src/runtime/effect.js';

/**
 * nu/smoothEdge - Smooth edge detection effect
 * Edge detection with Gaussian smoothing
 */
export default new Effect({
  name: "SmoothEdge",
  namespace: "filter",
  func: "smoothEdge",

  description: "Edge detection with Gaussian smoothing",
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
      program: "smoothEdge",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
});
