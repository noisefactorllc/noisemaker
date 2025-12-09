import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Kaleido",
  namespace: "classicNoisedeck",
  func: "kaleido",

  description: "Kaleidoscope effect",
  globals: {
    kaleido: {
      type: "int",
      default: 8,
      uniform: "kaleido",
      min: 2,
      max: 32,
      ui: {
        label: "sides",
        control: "slider",
        category: "general"
      }
    },
    metric: {
      type: "int",
      default: 0,
      uniform: "metric",
      choices: {
        circle: 0,
        diamond: 1,
        hexagon: 2,
        octagon: 3,
        square: 4,
        triangle: 5
      },
      ui: {
        label: "shape",
        control: "dropdown",
        category: "general"
      }
    },
    direction: {
      type: "int",
      default: 2,
      uniform: "direction",
      choices: {
        clockwise: 0,
        counterclock: 1,
        none: 2
      },
      ui: {
        label: "rotate",
        control: "dropdown",
        category: "animation"
      }
    },
    loopOffset: {
      type: "int",
      default: 10,
      uniform: "loopOffset",
      choices: {
        "Shapes:": null,
        circle: 10,
        triangle: 20,
        diamond: 30,
        square: 40,
        pentagon: 50,
        hexagon: 60,
        heptagon: 70,
        octagon: 80,
        nonagon: 90,
        decagon: 100,
        hendecagon: 110,
        dodecagon: 120,
        "Directional:": null,
        horizontalScan: 200,
        verticalScan: 210,
        "Noise:": null,
        noiseConstant: 300,
        noiseLinear: 310,
        noiseHermite: 320,
        noiseCatmullRom3x3: 330,
        noiseCatmullRom4x4: 340,
        noiseBSpline3x3: 350,
        noiseBSpline4x4: 360,
        noiseSimplex: 370,
        noiseSine: 380,
        "Misc:": null,
        rings: 400,
        sine: 410
      },
      ui: {
        label: "loop offset",
        control: "dropdown",
        category: "animation"
      }
    },
    loopScale: {
      type: "float",
      default: 1,
      uniform: "loopScale",
      min: 1,
      max: 100,
      ui: {
        label: "loop scale",
        control: "slider",
        category: "animation"
      }
    },
    loopAmp: {
      type: "float",
      default: 5,
      uniform: "loopAmp",
      min: -100,
      max: 100,
      ui: {
        label: "loop power",
        control: "slider",
        category: "animation"
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
    wrap: {
      type: "boolean",
      default: true,
      uniform: "wrap",
      ui: {
        label: "wrap",
        control: "checkbox",
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
        outline: 5,
        pixels: 10,
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
      type: "float",
      default: 0,
      uniform: "effectWidth",
      min: 0,
      max: 10,
      ui: {
        label: "effect width",
        control: "slider",
        category: "effect"
      }
    }
  },
  passes: [
    {
      name: "render",
      program: "kaleido",
      inputs: {
        inputTex: "inputTex"
      },

      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
