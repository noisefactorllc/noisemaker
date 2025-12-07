import { Effect } from '../../../src/runtime/effect.js';

/**
 * nu/rot - Rotate image 0..1 (0..360 degrees)
 */
export default new Effect({
  name: "Rotate",
  namespace: "filter",
  func: "rot",

  description: "Rotate image by specified angle",
  globals: {
    rotation: {
      type: "float",
      default: 0,
      uniform: "rotation",
      min: 0,
      max: 1,
      step: 0.01,
      ui: {
        label: "Rotation",
        control: "slider"
      }
    }
  },
  passes: [
    {
      name: "render",
      program: "rot",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
});
