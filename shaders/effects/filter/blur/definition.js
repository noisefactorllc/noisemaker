import { Effect } from '../../../src/runtime/effect.js';

/**
 * nu/blur - Gaussian blur with configurable kernel size
 * Separable 2-pass blur for efficiency
 */
export default new Effect({
  name: "Blur",
  namespace: "filter",
  func: "blur",

  description: "Gaussian blur with separate X and Y radius controls",
  globals: {
    radiusX: {
      type: "float",
      default: 5.0,
      uniform: "radiusX",
      min: 0,
      max: 50,
      step: 1,
      ui: {
        label: "Radius X",
        control: "slider"
      }
    },
    radiusY: {
      type: "float",
      default: 5.0,
      uniform: "radiusY",
      min: 0,
      max: 50,
      step: 1,
      ui: {
        label: "Radius Y",
        control: "slider"
      }
    }
  },
  textures: {
    _blurTemp: {
      width: "input",
      height: "input",
      format: "rgba8unorm"
    }
  },
  passes: [
    {
      name: "blurH",
      program: "blurH",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "_blurTemp"
      }
    },
    {
      name: "blurV",
      program: "blurV",
      inputs: {
        inputTex: "_blurTemp"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
});
