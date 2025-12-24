import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "CellRefract",
  namespace: "classicNoisedeck",
  func: "cellRefract",
  tags: ["distort", "noise"],

  description: "Cell-based refraction",
  globals: {
    shape: {
      type: "int",
      default: 1,
      uniform: "metric",
      choices: {
        circle: 0,
        diamond: 1,
        hexagon: 2,
        octagon: 3,
        square: 4,
        triangle: 6
      },
      ui: {
        label: "shape",
        control: "dropdown"
      }
    },
    scale: {
      type: "float",
      default: 50,
      uniform: "scale",
      min: 1,
      max: 100,
      ui: {
        label: "scale",
        control: "slider",
        category: "transform"
      }
    },
    cellScale: {
      type: "float",
      default: 75,
      uniform: "cellScale",
      min: 1,
      max: 100,
      ui: {
        label: "cell scale",
        control: "slider",
        category: "transform"
      }
    },
    cellSmooth: {
      type: "float",
      default: 0,
      uniform: "cellSmooth",
      min: 0,
      max: 100,
      ui: {
        label: "cell smooth",
        control: "slider"
      }
    },
    cellVariation: {
      type: "float",
      default: 0,
      uniform: "cellVariation",
      min: 0,
      max: 100,
      ui: {
        label: "cell variation",
        control: "slider"
      }
    },
    loopAmp: {
      type: "int",
      default: 1,
      uniform: "loopAmp",
      min: 0,
      max: 5,
      ui: {
        label: "speed",
        control: "slider",
        category: "animation"
      }
    },
    kernel: {
      type: "int",
      default: 0,
      uniform: "kernel",
      choices: {
        none: 0,
        blur: 1,
        derivatives: 120,
        derivDivide: 2,
        edge: 3,
        emboss: 4,
        litEdge: 9,
        outline: 5,
        pixels: 100,
        posterize: 110,
        shadow: 6,
        sharpen: 7,
        sobel: 8
      },
      ui: {
        label: "effect",
        control: "dropdown",
        category: "effect"
      }
    },
    effectWidth: {
      type: "int",
      default: 0,
      uniform: "effectWidth",
      min: 0,
      max: 10,
      ui: {
        label: "effect width",
        control: "slider",
        category: "effect"
      }
    },
    refractAmt: {
      type: "float",
      default: 23,
      uniform: "refractAmt",
      min: 0,
      max: 100,
      ui: {
        label: "refract",
        control: "slider",
        category: "refract"
      }
    },
    refractDir: {
      type: "float",
      default: 0,
      uniform: "refractDir",
      min: 0,
      max: 360,
      ui: {
        label: "refract dir",
        control: "slider",
        category: "refract"
      }
    },
    wrap: {
      type: "int",
      default: 0,
      uniform: "wrap",
      choices: {
        mirror: 0,
        repeat: 1
      },
      ui: {
        label: "wrap",
        control: "dropdown",
        category: "refract"
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
    }
  },
  passes: [
    {
      name: "render",
      program: "cellRefract",
      inputs: {
        inputTex: "inputTex"
      },

      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
