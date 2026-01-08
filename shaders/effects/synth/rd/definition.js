import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Rd",
  func: "rd",
  tags: ["sim"],

  description: "Gray-Scott reaction-diffusion",
  uniformLayouts: {
    rd: {
      resolution: { slot: 0, components: 'xy' },
      time: { slot: 0, components: 'z' },
      smoothing: { slot: 3, components: 'w' }
    },
    rdFb: {
      resolution: { slot: 0, components: 'xy' },
      time: { slot: 0, components: 'z' },
      zoom: { slot: 0, components: 'w' },
      feed: { slot: 1, components: 'x' },
      kill: { slot: 1, components: 'y' },
      rate1: { slot: 1, components: 'z' },
      rate2: { slot: 1, components: 'w' },
      speed: { slot: 2, components: 'x' },
      weight: { slot: 2, components: 'y' },
      sourceF: { slot: 2, components: 'z' },
      sourceK: { slot: 2, components: 'w' },
      sourceR1: { slot: 3, components: 'x' },
      sourceR2: { slot: 3, components: 'y' },
      resetState: { slot: 3, components: 'z' },
      seed: { slot: 3, components: 'w' }
    }
  },
  globals: {
    tex: {
      type: "surface",
      default: "none",
      ui: { label: "texture" }
    },
    resetState: {
      type: "boolean",
      default: false,
      uniform: "resetState",
      ui: {
        control: "button",
        buttonLabel: "reset",
        label: "state",
        category: "util"
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
        control: "slider"
      }
    },
    iterations: {
      type: "int",
      default: 8,
      uniform: "iterations",
      min: 1,
      max: 32,
      ui: {
        label: "iterations",
        control: "slider"
      }
    },
    sourceF: {
      type: "int",
      default: 0,
      uniform: "sourceF",
      choices: {
        slider: 0,
        sliderInput: 6,
        brightness: 1,
        darkness: 2,
        red: 3,
        green: 4,
        blue: 5
      },
      ui: {
        label: "feed source",
        control: "dropdown"
      }
    },
    feed: {
      type: "float",
      default: 18,
      uniform: "feed",
      min: 10,
      max: 110,
      ui: {
        label: "feed value",
        control: "slider"
      }
    },
    sourceK: {
      type: "int",
      default: 0,
      uniform: "sourceK",
      choices: {
        slider: 0,
        sliderInput: 6,
        brightness: 1,
        darkness: 2,
        red: 3,
        green: 4,
        blue: 5
      },
      ui: {
        label: "kill source",
        control: "dropdown"
      }
    },
    kill: {
      type: "float",
      default: 51,
      uniform: "kill",
      min: 45,
      max: 70,
      ui: {
        label: "kill value",
        control: "slider"
      }
    },
    sourceR1: {
      type: "int",
      default: 0,
      uniform: "sourceR1",
      choices: {
        slider: 0,
        sliderInput: 6,
        brightness: 1,
        darkness: 2,
        red: 3,
        green: 4,
        blue: 5
      },
      ui: {
        label: "rate 1 source",
        control: "dropdown"
      }
    },
    rate1: {
      type: "float",
      default: 111,
      uniform: "rate1",
      min: 50,
      max: 120,
      ui: {
        label: "rate 1 value",
        control: "slider"
      }
    },
    sourceR2: {
      type: "int",
      default: 0,
      uniform: "sourceR2",
      choices: {
        slider: 0,
        sliderInput: 6,
        brightness: 1,
        darkness: 2,
        red: 3,
        green: 4,
        blue: 5
      },
      ui: {
        label: "rate 2 source",
        control: "dropdown"
      }
    },
    rate2: {
      type: "float",
      default: 24,
      uniform: "rate2",
      min: 20,
      max: 50,
      ui: {
        label: "rate 2 value",
        control: "slider"
      }
    },
    weight: {
      type: "float",
      default: 50,
      uniform: "weight",
      min: 0,
      max: 100,
      ui: {
        label: "input weight",
        control: "slider",
        category: "misc"
      }
    },
    speed: {
      type: "float",
      default: 100,
      uniform: "speed",
      min: 10,
      max: 145,
      ui: {
        label: "speed",
        control: "slider",
        category: "animation"
      }
    },
    zoom: {
      type: "int",
      default: 8,
      uniform: "zoom",
      choices: {
        x1: 1,
        x2: 2,
        x4: 4,
        x8: 8,
        x16: 16,
        x32: 32,
        x64: 64
      },
      ui: {
        label: "zoom",
        control: "dropdown",
        category: "transform"
      }
    },
    smoothing: {
      type: "int",
      default: 1,
      uniform: "smoothing",
      choices: {
        constant: 0,
        linear: 1,
        hermite: 2,
        catmullRom3x3: 3,
        catmullRom4x4: 4,
        bSpline3x3: 5,
        bSpline4x4: 6
      },
      ui: {
        label: "smoothing",
        control: "dropdown",
        category: "misc"
      }
    }
  },
  passes: [
    {
      name: "simulate",
      program: "rdFb",
      repeat: "iterations",
      inputs: {
        bufTex: "global_rd_state",
        inputTex: "tex"
      },
      outputs: {
        fragColor: "global_rd_state"
      }
    },
    {
      name: "render",
      program: "rd",
      inputs: {
        fbTex: "global_rd_state"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
