import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Ca",
  func: "ca",
  tags: ["sim"],

  description: "2D cellular automata with rule presets",
  uniformLayouts: {
    ca: {
      resolution: { slot: 0, components: 'xy' },
      time: { slot: 0, components: 'z' },
      smoothing: { slot: 1, components: 'y' }
    },
    caFb: {
      deltaTime: { slot: 0, components: 'y' },
      seed: { slot: 0, components: 'z' },
      resetState: { slot: 0, components: 'w' },
      ruleIndex: { slot: 1, components: 'x' },
      speed: { slot: 1, components: 'y' },
      weight: { slot: 1, components: 'z' },
      useCustom: { slot: 1, components: 'w' },
      bornMask0: { slot: 2, components: 'xyzw' },
      bornMask1: { slot: 3, components: 'xyzw' },
      bornMask2: { slot: 4, components: 'x' },
      surviveMask0: { slot: 4, components: 'yzw' },
      surviveMask1: { slot: 5, components: 'xyzw' },
      surviveMask2: { slot: 6, components: 'xy' },
      source: { slot: 6, components: 'z' }
    }
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
      default: 32,
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
        label: "state",
        category: "util"
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
        control: "dropdown",
        category: "misc"
      },
      uniform: "smoothing"
    },
    ruleIndex: {
      type: "int",
      default: 0,
      choices: {
        classicLife: 0,
        highlife: 1,
        seeds: 2,
        coral: 3,
        dayNight: 4,
        lifeWithoutDeath: 5,
        replicator: 6,
        amoeba: 7,
        maze: 8,
        gliderWalk: 9,
        diamoeba: 10,
        size2x2: 11,
        morley: 12,
        anneal: 13,
        size34Life: 14,
        simpleReplicator: 15,
        waffles: 16,
        pondLife: 17
      },
      ui: {
        label: "rules",
        control: "dropdown"
      },
      uniform: "ruleIndex"
    },
    useCustom: {
      type: "boolean",
      default: false,
      ui: {
        label: "use custom",
        control: "checkbox"
      },
      uniform: "useCustom"
    },
    speed: {
      type: "float",
      default: 10,
      min: 1,
      max: 100,
      ui: {
        label: "speed",
        control: "slider",
        category: "animation"
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
        control: "slider",
        category: "misc"
      },
      uniform: "weight"
    },
    source: {
      type: "int",
      default: 0,
      min: 0,
      max: 7,
      ui: {
        control: false,
        category: "misc"
      },
      uniform: "source"
    },
  },
  passes: [
    {
      name: "update",
      program: "caFb",
      inputs: {
        bufTex: "global_ca_state",
        tex: "tex"
      },
      outputs: {
        fragColor: "global_ca_state"
      }
    },
    {
      name: "render",
      program: "ca",
      inputs: {
        fbTex: "global_ca_state",
        prevFrameTex: "global_ca_state",
        bufTex: "global_ca_state",
        tex: "tex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
