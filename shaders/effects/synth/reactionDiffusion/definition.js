import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Reaction-Diffusion",
  func: "reactionDiffusion",
  tags: ["sim"],

  description: "Gray-Scott reaction-diffusion",
  uniformLayouts: {
    rd: {
      resolution: { slot: 0, components: 'xy' },
      time: { slot: 0, components: 'z' },
      inputIntensity: { slot: 1, components: 'x' },
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
  textures: {
    global_rd_state: {
      width: { screenDivide: 'zoom', default: 8 },
      height: { screenDivide: 'zoom', default: 8 }
    }
  },
  globals: {
    tex: {
      type: "surface",
      default: "none",
      ui: {
        label: "texture",
        category: "input",
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
      randChoices: [4, 8, 16, 32, 64],
      ui: {
        label: "zoom",
        control: "dropdown"
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
        control: "dropdown"
      }
    },
    speed: {
      type: "float",
      default: 100,
      uniform: "speed",
      min: 10,
      max: 145,
      randMax: 50,
      ui: {
        label: "speed",
        control: "slider"
      }
    },
    resetState: {
      type: "boolean",
      default: false,
      uniform: "resetState",
      ui: {
        control: "button",
        buttonLabel: "reset",
        label: "state"
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
        control: false
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
      randChance: 0,
      ui: {
        label: "feed source",
        control: "dropdown",
        category: "rules"
      }
    },
    feed: {
      type: "float",
      default: 70,
      uniform: "feed",
      min: 10,
      max: 110,
      randMin: 20,
      ui: {
        label: "feed value",
        control: "slider",
        category: "rules"
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
      randChance: 0,
      ui: {
        label: "kill source",
        control: "dropdown",
        category: "rules"
      }
    },
    kill: {
      type: "float",
      default: 67,
      uniform: "kill",
      min: 45,
      max: 70,
      ui: {
        label: "kill value",
        control: "slider",
        category: "rules"
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
      randChance: 0,
      ui: {
        label: "rate 1 source",
        control: "dropdown",
        category: "rules"
      }
    },
    rate1: {
      type: "float",
      default: 92,
      uniform: "rate1",
      min: 50,
      max: 120,
      ui: {
        label: "rate 1 value",
        control: "slider",
        category: "rules"
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
      randChance: 0,
      ui: {
        label: "rate 2 source",
        control: "dropdown",
        category: "rules"
      }
    },
    rate2: {
      type: "float",
      default: 22,
      uniform: "rate2",
      min: 20,
      max: 50,
      randMax: 35,
      ui: {
        label: "rate 2 value",
        control: "slider",
        category: "rules"
      }
    },
    iterations: {
      type: "int",
      default: 8,
      uniform: "iterations",
      min: 1,
      max: 32,
      randMin: 6,
      ui: {
        label: "iterations",
        control: "slider",
        category: "rules"
      }
    },
    weight: {
      type: "float",
      default: 0,
      uniform: "weight",
      min: 0,
      max: 100,
      randChance: 0,
      ui: {
        label: "input weight",
        control: "slider",
        category: "input",
        enabledBy: { param: "tex", neq: "none" }
      }
    },
    inputIntensity: {
      type: "float",
      default: 0,
      uniform: "inputIntensity",
      min: 0,
      max: 100,
      randChance: 0,
      ui: {
        label: "input mix",
        control: "slider",
        category: "input",
        enabledBy: { param: "tex", neq: "none" }
      }
    },

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
        fbTex: "global_rd_state",
        inputTex: "tex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
