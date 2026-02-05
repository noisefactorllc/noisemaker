import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Glitch",
  namespace: "classicNoisedeck",
  func: "glitch",
  tags: ["distort", "noise"],

  description: "Digital glitch effects",
  globals: {
    seed: {
      type: "int",
      default: 1,
      uniform: "seed",
      min: 1,
      max: 100,
      ui: {
        label: "seed",
        control: "slider",
        category: "util"
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
    aberration: {
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
        control: "slider",
        category: "effects"
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
        control: "slider",
        category: "effects"
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
        control: "slider",
        category: "effects"
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
        control: "slider",
        category: "distortion"
      }
    },
    aspectLens: {
      type: "boolean",
      default: false,
      uniform: "aspectLens",
      ui: {
        label: "1:1 aspect",
        control: "checkbox",
        category: "distortion"
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
      type: "int",
      default: 0,
      uniform: "levels",
      ui: {
        label: "levels",
        control: "slider"
      }
    }
  },
  paramAliases: { aberrationAmt: 'aberration' },
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
})
