import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Composite",
  namespace: "classicNoisedeck",
  func: "composite",
  tags: ["color", "util"],

  description: "Multi-layer compositing",
  globals: {
    tex: {
      type: "surface",
      default: "inputTex",
      uniform: "tex",
      ui: {
        label: "source surface B"
      }
    },
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
    blendMode: {
      type: "int",
      default: 1,
      uniform: "blendMode",
      choices: {
        colorSplash: 0,
        greenscreenAB: 1,
        greenscreenBA: 2,
        aBBlack: 3,
        aBColorBlack: 4,
        aBHue: 5,
        aBSaturation: 6,
        aBValue: 7,
        bABlack: 8,
        bAColorBlack: 9,
        bAHue: 10,
        bASaturation: 11,
        bAValue: 12,
        mix: 13,
        psychedelic: 14,
        psychedelic2: 15
      },
      ui: {
        label: "mode",
        control: "dropdown"
      }
    },
    inputColor: {
      type: "vec3",
      default: [0.0, 0.0, 0.0],
      uniform: "inputColor",
      ui: {
        label: "color",
        control: "color"
      }
    },
    range: {
      type: "float",
      default: 20,
      uniform: "range",
      min: 0,
      max: 100,
      ui: {
        label: "range",
        control: "slider"
      }
    },
    mixAmt: {
      type: "float",
      default: 50,
      uniform: "mixAmt",
      min: 0,
      max: 100,
      ui: {
        label: "mix",
        control: "slider"
      }
    }
  },
  passes: [
    {
      name: "render",
      program: "composite",
      inputs: {
              inputTex: "inputTex",
              tex: "tex"
            }
,
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
