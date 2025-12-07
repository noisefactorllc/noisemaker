import { Effect } from '../../../src/runtime/effect.js';

/**
 * Vignette - normalize input and blend edges toward constant brightness
 */
export default new Effect({
  name: "Vignette",
  namespace: "classicNoisemaker",
  func: "vignette",
  globals: {
    brightness: {
      type: "float",
      default: 0,
      uniform: "brightness",
      min: 0,
      max: 1,
      step: 0.01,
      ui: {
        label: "Brightness",
        control: "slider"
      }
    },
    alpha: {
      type: "float",
      default: 1,
      uniform: "alpha",
      min: 0,
      max: 1,
      step: 0.01,
      ui: {
        label: "Alpha",
        control: "slider"
      }
    }
  },
  passes: [
    {
      name: "main",
      program: "vignette",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        color: "outputTex"
      }
    }
  ]
});
