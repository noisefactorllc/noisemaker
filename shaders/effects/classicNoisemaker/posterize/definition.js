import { Effect } from '../../../src/runtime/effect.js';

/**
 * Posterize
 * /shaders/effects/posterize/posterize.wgsl
 */
export default new Effect({
  name: "Posterize",
  namespace: "classicNoisemaker",
  func: "posterize",
  globals: {
    levels: {
        type: "float",
        default: 5,
        uniform: "levels",
        min: 2,
        max: 32,
        step: 1,
        ui: {
            label: "Levels",
            control: "slider"
        }
    },
    gamma: {
        type: "float",
        default: 1,
        uniform: "gamma",
        min: 0.1,
        max: 3,
        step: 0.05,
        ui: {
            label: "Gamma",
            control: "slider"
        }
    }
},
  passes: [
    {
      name: "main",
      program: "posterize",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        color: "outputTex"
      }
    }
  ]
});
