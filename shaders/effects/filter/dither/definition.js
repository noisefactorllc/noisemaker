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
      default: 1,
      uniform: "palette",
      choices: {
        input1bit: 0,
        input2bit: 1,
        monochrome: 2,
        dotMatrixGreen: 3,
        amberMonitor: 4,
        pico8: 5,
        commodore64: 6,
        cgaPalette1: 7,
        zxSpectrum: 8,
        appleII: 9,
        ega: 10
      },
      ui: {
        label: "palette",
        control: "dropdown"
      }
    },
    mix: {
      type: "float",
      default: 1.0,
      uniform: "mixAmount",
      min: 0.0,
      max: 1.0,
      step: 0.01,
      ui: {
        label: "mix",
        control: "slider"
      }
    }
  },
  paramAliases: { ditherType: 'type' },
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
