import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Coalesce",
  namespace: "classicNoisedeck",
  func: "coalesce",
  tags: ["color", "distort"],

  description: "Coalescing blend effect",
  globals: {
    tex: {
      type: "surface",
      default: "inputTex",
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
      default: 10,
      uniform: "blendMode",
      choices: {
        add: 0,
        alpha: 1,
        brightnessAB: 1004,
        brightnessBA: 1005,
        cloak: 100,
        colorBurn: 2,
        colorDodge: 3,
        darken: 4,
        difference: 5,
        exclusion: 6,
        glow: 7,
        hardLight: 8,
        hueAB: 1000,
        hueBA: 1001,
        lighten: 9,
        mix: 10,
        multiply: 11,
        negation: 12,
        overlay: 13,
        phoenix: 14,
        reflect: 15,
        saturationAB: 1002,
        saturationBA: 1003,
        screen: 16,
        softLight: 17,
        subtract: 18
      },
      ui: {
        label: "mode",
        control: "dropdown"
      }
    },
    mixAmt: {
      type: "float",
      default: 0,
      uniform: "mixAmt",
      min: -100,
      max: 100,
      ui: {
        label: "mix",
        control: "slider"
      }
    },
    refractAAmt: {
      type: "float",
      default: 0,
      uniform: "refractAAmt",
      min: 0,
      max: 100,
      ui: {
        label: "refract a→b",
        control: "slider",
        category: "refract"
      }
    },
    refractBAmt: {
      type: "float",
      default: 0,
      uniform: "refractBAmt",
      min: 0,
      max: 100,
      ui: {
        label: "refract b→a",
        control: "slider",
        category: "refract"
      }
    },
    refractADir: {
      type: "float",
      default: 0,
      uniform: "refractADir",
      min: 0,
      max: 360,
      ui: {
        label: "refract dir a",
        control: "slider",
        category: "refract"
      }
    },
    refractBDir: {
      type: "float",
      default: 0,
      uniform: "refractBDir",
      min: 0,
      max: 360,
      ui: {
        label: "refract dir b",
        control: "slider",
        category: "refract"
      }
    }
  },
  passes: [
    {
      name: "render",
      program: "coalesce",
      inputs: {
        inputTex: "inputTex",
        tex: "tex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
