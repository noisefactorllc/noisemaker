import { Effect } from '../../../src/runtime/effect.js';

export default new Effect({
  name: "Glitch",
  namespace: "classicNoisedeck",
  func: "glitch",
  globals: {
    seed: {
      type: "int",
      default: 1,
      uniform: "seed",
      min: 1,
      max: 100,
      ui: {
        label: "seed",
        control: "slider"
      }
    },
    glitchiness: {
      type: "float",
      default: 0,
      uniform: "glitchiness",
      min: 0,
      max: 100,
      ui: {
        label: "glitchiness",
        control: "slider"
      }
    },
    aberrationAmt: {
      type: "float",
      default: 0,
      uniform: "aberrationAmt",
      min: 0,
      max: 100,
      ui: {
        label: "aberration",
        control: "slider"
      }
    },
    xChonk: {
      type: "int",
      default: 1,
      uniform: "xChonk",
      min: 1,
      max: 100,
      ui: {
        label: "width",
        control: "slider"
      }
    },
    yChonk: {
      type: "int",
      default: 1,
      uniform: "yChonk",
      min: 1,
      max: 100,
      ui: {
        label: "height",
        control: "slider"
      }
    },
    scanlinesAmt: {
      type: "int",
      default: 0,
      uniform: "scanlinesAmt",
      min: 0,
      max: 100,
      ui: {
        label: "scanlines",
        control: "slider"
      }
    },
    snowAmt: {
      type: "float",
      default: 0,
      uniform: "snowAmt",
      min: 0,
      max: 100,
      ui: {
        label: "snow",
        control: "slider"
      }
    },
    vignetteAmt: {
      type: "float",
      default: 0,
      uniform: "vignetteAmt",
      min: -100,
      max: 100,
      ui: {
        label: "vignette",
        control: "slider"
      }
    },
    distortion: {
      type: "float",
      default: 0,
      uniform: "distortion",
      min: -100,
      max: 100,
      ui: {
        label: "lens",
        control: "slider"
      }
    },
    aspectLens: {
      type: "boolean",
      default: false,
      uniform: "aspectLens",
      ui: {
        label: "1:1 aspect",
        control: "checkbox"
      }
    },
    kernel: {
      type: "int",
      default: 0,
      uniform: "kernel",
      ui: {
        label: "kernel",
        control: "slider"
      }
    },
    levels: {
      type: "float",
      default: 0,
      uniform: "levels",
      ui: {
        label: "levels",
        control: "slider"
      }
    }
  },
  passes: [
    {
      name: "render",
      program: "glitch",
      inputs: {
        inputTex: "inputTex"
      },

      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
});
