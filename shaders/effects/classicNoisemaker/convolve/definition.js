import { Effect } from '../../../src/runtime/effect.js';

/**
 * Convolve
 * /shaders/effects/convolve/convolve.wgsl
 */
export default new Effect({
  name: "Convolve",
  namespace: "classicNoisemaker",
  func: "convolve",

  description: "Convolution kernel filter",
  globals: {
    kernel: {
        type: "int",
        default: 800,
        uniform: "kernel",
        min: 800,
        max: 810,
        step: 1,
        ui: {
            label: "Kernel Id",
            control: "slider"
        }
    },
    withNormalize: {
        type: "float",
        default: 1.0,
        uniform: "withNormalize",
        min: 0,
        max: 1,
        step: 1,
        ui: {
            label: "Normalize",
            control: "checkbox"
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
  textures: {
    _convolved: { format: "rgba32f" },
    _minmax1: { width: 32, height: 32, format: "rgba32f" },
    _minmaxGlobal: { width: 1, height: 1, format: "rgba32f" }
  },
  passes: [
    {
      name: "convolve",
      program: "convolveRender",
      inputs: {
        inputTex: "inputTex"
      },
      uniforms: {
        kernel: "kernel"
      },
      outputs: {
        fragColor: "_convolved"
      }
    },
    {
      name: "reduce1",
      program: "reduce1",
      viewport: { width: 32, height: 32 },
      inputs: {
        inputTex: "_convolved"
      },
      outputs: {
        fragColor: "_minmax1"
      }
    },
    {
      name: "reduce2",
      program: "reduce2",
      viewport: { width: 1, height: 1 },
      inputs: {
        inputTex: "_minmax1"
      },
      outputs: {
        fragColor: "_minmaxGlobal"
      }
    },
    {
      name: "normalize",
      program: "normalizeRender",
      inputs: {
        convolvedTexture: "_convolved",
        minmaxTexture: "_minmaxGlobal",
        inputTex: "inputTex"
      },
      uniforms: {
        kernel: "kernel",
        withNormalize: "withNormalize",
        alpha: "alpha"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
});
