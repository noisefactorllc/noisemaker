import { Effect } from '../../../src/runtime/effect.js';

/**
 * nu/vignette - Radial vignette with brightness blend
 */
export default new Effect({
  name: "Vignette",
  namespace: "filter",
  func: "vignette",
  globals: {
    brightness: {
      type: "float",
      default: 0,
      uniform: "vignetteBrightness",
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
      uniform: "vignetteAlpha",
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
      name: "render",
      program: "vignette",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
});
