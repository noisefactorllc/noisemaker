import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Mnca",
  func: "mnca",
  tags: ["sim"],

  description: "Multi-neighborhood cellular automata",
  uniformLayout: {
    resolution: { slot: 0, components: 'xy' },
    time: { slot: 0, components: 'z' },
    deltaTime: { slot: 0, components: 'w' },

    speed: { slot: 1, components: 'x' },
    smoothing: { slot: 1, components: 'y' },
    weight: { slot: 1, components: 'z' },
    seed: { slot: 1, components: 'w' },

    resetState: { slot: 2, components: 'x' },
    n1v1: { slot: 2, components: 'y' },
    n1r1: { slot: 2, components: 'z' },
    n1v2: { slot: 2, components: 'w' },

    n1r2: { slot: 3, components: 'x' },
    n1v3: { slot: 3, components: 'y' },
    n1r3: { slot: 3, components: 'z' },
    n1v4: { slot: 3, components: 'w' },

    n1r4: { slot: 4, components: 'x' },
    n2v1: { slot: 4, components: 'y' },
    n2r1: { slot: 4, components: 'z' },
    n2v2: { slot: 4, components: 'w' },

    n2r2: { slot: 5, components: 'x' }
  },
  textures: {},
  globals: {
    tex: {
      type: "surface",
      default: "none",
      ui: { label: "texture" }
    },
    zoom: {
      type: "int",
      default: 8,
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
        control: "dropdown"
      }
    },
    seed: {
      type: "float",
      default: 1,
      min: 1,
      max: 100,
      ui: {
        label: "seed",
        control: "slider"
      },
      uniform: "seed"
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
    smoothing: {
      type: "int",
      default: 0,
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
      },
      uniform: "smoothing"
    },
    speed: {
      type: "float",
      default: 10,
      min: 1,
      max: 100,
      ui: {
        label: "speed",
        control: "slider"
      },
      uniform: "speed"
    },
    weight: {
      type: "float",
      default: 0,
      min: 0,
      max: 100,
      ui: {
        label: "input weight",
        control: "slider"
      },
      uniform: "weight"
    },
    n1v1: {
      type: "float",
      default: 21,
      min: 0,
      max: 100,
      ui: {
        label: "n1 thresh 1",
        control: "slider"
      },
      uniform: "n1v1"
    },
    n1r1: {
      type: "float",
      default: 1,
      min: 0,
      max: 100,
      ui: {
        label: "n1 range 1",
        control: "slider"
      },
      uniform: "n1r1"
    },
    n1v2: {
      type: "float",
      default: 35,
      min: 0,
      max: 100,
      ui: {
        label: "n1 thresh 2",
        control: "slider"
      },
      uniform: "n1v2"
    },
    n1r2: {
      type: "float",
      default: 15,
      min: 0,
      max: 100,
      ui: {
        label: "n1 range 2",
        control: "slider"
      },
      uniform: "n1r2"
    },
    n1v3: {
      type: "float",
      default: 75,
      min: 0,
      max: 100,
      ui: {
        label: "n1 thresh 3",
        control: "slider"
      },
      uniform: "n1v3"
    },
    n1r3: {
      type: "float",
      default: 10,
      min: 0,
      max: 100,
      ui: {
        label: "n1 range 3",
        control: "slider"
      },
      uniform: "n1r3"
    },
    n1v4: {
      type: "float",
      default: 12,
      min: 0,
      max: 100,
      ui: {
        label: "n1 thresh 4",
        control: "slider"
      },
      uniform: "n1v4"
    },
    n1r4: {
      type: "float",
      default: 3,
      min: 0,
      max: 100,
      ui: {
        label: "n1 range 4",
        control: "slider"
      },
      uniform: "n1r4"
    },
    n2v1: {
      type: "float",
      default: 10,
      min: 0,
      max: 100,
      ui: {
        label: "n2 thresh 1",
        control: "slider"
      },
      uniform: "n2v1"
    },
    n2r1: {
      type: "float",
      default: 18,
      min: 0,
      max: 100,
      ui: {
        label: "n2 range 1",
        control: "slider"
      },
      uniform: "n2r1"
    },
    n2v2: {
      type: "float",
      default: 43,
      min: 0,
      max: 100,
      ui: {
        label: "n2 thresh 2",
        control: "slider"
      },
      uniform: "n2v2"
    },
    n2r2: {
      type: "float",
      default: 12,
      min: 0,
      max: 100,
      ui: {
        label: "n2 range 2",
        control: "slider"
      },
      uniform: "n2r2"
    },
    source: {
      type: "int",
      default: 0,
      min: 0,
      max: 7,
      ui: {
        control: false
      },
      uniform: "source"
    },
  },
  passes: [
    {
      name: "update",
      program: "mncaFb",
      inputs: {
        bufTex: "global_mnca_state",
        seedTex: "tex"
      },
      outputs: {
        fragColor: "global_mnca_state"
      }
    },
    {
      name: "render",
      program: "mnca",
      inputs: {
        fbTex: "global_mnca_state",
        prevFrameTex: "global_mnca_state",
        bufTex: "global_mnca_state",
        seedTex: "tex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
