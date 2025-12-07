import { Effect } from '../../../src/runtime/effect.js';

/**
 * nu/posterize - Color posterization effect
 * Reduces color levels for poster-like appearance
 */
export default new Effect({
  name: "Posterize",
  namespace: "filter",
  func: "posterize",

  description: "Reduce color levels for poster effect",
  globals: {
    levels: {
      type: "float",
      default: 4.0,
      uniform: "levels",
      min: 1,
      max: 20,
      ui: {
        label: "levels",
        control: "slider"
      }
    }
  },
  passes: [
    {
      name: "render",
      program: "posterize",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
});
