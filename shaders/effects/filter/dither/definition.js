import { Effect } from '../../../src/runtime/effect.js'

/**
 * nu/dither - Ordered dithering effect
 * Applies various dithering patterns and color palettes for retro aesthetics
 */
export default new Effect({
  name: "Dither",
  namespace: "filter",
  func: "dither",
  tags: ["color", "pixel"],

  description: "Ordered dithering with classic patterns and palettes",
  globals: {
    type: {
      type: "int",
      default: 1,
      uniform: "ditherType",
      choices: {
        bayer2x2: 0,
        bayer4x4: 1,
        bayer8x8: 2,
        dot: 3,
        line: 4,
        crosshatch: 5,
        noise: 6
      },
      ui: {
        label: "type",
        control: "dropdown"
      }
    },
    matrixScale: {
      type: "int",
      default: 2,
      uniform: "matrixScale",
      min: 1,
      max: 8,
      randMax: 4,
      ui: {
        label: "pattern scale",
        control: "slider"
      }
    },
    threshold: {
      type: "float",
      default: 0.0,
      uniform: "threshold",
      min: -0.5,
      max: 0.5,
      step: 0.01,
      ui: {
        label: "threshold",
        control: "slider"
      }
    },
    palette: {
      type: "int",
      default: 0,
      uniform: "palette",
      choices: {
        input: 0,
        monochrome: 1,
        dotMatrixGreen: 2,
        amberMonitor: 3,
        pico8: 4,
        commodore64: 5,
        cgaPalette1: 6,
        zxSpectrum: 7,
        appleII: 8,
        ega: 9
      },
      ui: {
        label: "palette",
        control: "dropdown"
      }
    },
    levels: {
      type: "int",
      default: 4,
      uniform: "levels",
      min: 2,
      max: 16,
      ui: {
        label: "levels",
        control: "slider",
        enabledBy: { param: "palette", eq: 0 }
      }
    },
    mix: {
      type: "float",
      default: 1.0,
      uniform: "mixAmount",
      min: 0.0,
      max: 1.0,
      step: 0.01,
      randMin: 0.5,
      ui: {
        label: "mix",
        control: "slider"
      }
    }
  },
  paramAliases: { ditherType: 'type', mixAmount: 'mix' },
  passes: [
    {
      name: "render",
      program: "dither",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
