import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Noise",
  namespace: "synth",
  func: "noise",
  tags: ["noise"],

  description: "Value noise with multiple interpolation types",
  uniformLayout: {
    resolution: { slot: 0, components: 'xy' },
    time: { slot: 0, components: 'z' },
    aspectRatio: { slot: 0, components: 'w' },
    xScale: { slot: 1, components: 'x' },
    yScale: { slot: 1, components: 'y' },
    seed: { slot: 1, components: 'z' },
    loopScale: { slot: 1, components: 'w' },
    loopAmp: { slot: 2, components: 'x' },
    loopOffset: { slot: 2, components: 'y' },
    noiseType: { slot: 2, components: 'z' },
    octaves: { slot: 2, components: 'w' },
    ridges: { slot: 3, components: 'x' },
    wrap: { slot: 3, components: 'y' },
    colorMode: { slot: 3, components: 'z' }
  },
  globals: {
    noiseType: {
      type: "int",
      default: 10,
      uniform: "noiseType",
      choices: {
        constant: 0,
        linear: 1,
        hermite: 2,
        catmullRom3x3: 3,
        catmullRom4x4: 4,
        bSpline3x3: 5,
        bSpline4x4: 6,
        simplex: 10,
        sine: 11
      },
      ui: {
        label: "noise type",
        control: "dropdown"
      }
    },
    octaves: {
      type: "int",
      default: 2,
      uniform: "octaves",
      min: 1,
      max: 8,
      ui: {
        label: "octaves",
        control: "slider"
      }
    },
    xScale: {
      type: "float",
      default: 75,
      uniform: "xScale",
      min: 1,
      max: 100,
      ui: {
        label: "horiz scale",
        control: "slider",
        category: "transform"
      }
    },
    yScale: {
      type: "float",
      default: 75,
      uniform: "yScale",
      min: 1,
      max: 100,
      ui: {
        label: "vert scale",
        control: "slider",
        category: "transform"
      }
    },
    ridges: {
      type: "boolean",
      default: false,
      uniform: "ridges",
      ui: {
        label: "ridges",
        control: "checkbox"
      }
    },
    wrap: {
      type: "boolean",
      default: true,
      uniform: "wrap",
      ui: {
        label: "wrap",
        control: "checkbox"
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
    loopOffset: {
      type: "int",
      default: 300,
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
        "Misc:": null,
        noise: 300,
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
      default: 75,
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
      default: 25,
      uniform: "loopAmp",
      min: -100,
      max: 100,
      ui: {
        label: "loop power",
        control: "slider",
        category: "animation"
      }
    },
    colorMode: {
      type: "int",
      default: 1,
      uniform: "colorMode",
      choices: {
        mono: 0,
        rgb: 1
      },
      ui: {
        label: "color mode",
        control: "dropdown",
        category: "color"
      }
    }
  },
  passes: [
    {
      name: "render",
      program: "noise",
      inputs: {
      },

      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
