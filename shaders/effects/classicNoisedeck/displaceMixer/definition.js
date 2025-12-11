import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "DisplaceMixer",
  namespace: "classicNoisedeck",
  func: "displaceMixer",

  description: "Displacement-based mixing",
  globals: {
    tex: {
      type: "surface",
      default: "inputTex",
      ui: {
        label: "source surface B"
      }
    },
    mode: {
      type: "int",
      default: 1,
      uniform: "mode",
      choices: {
        displace: 0,
        reflect: 2,
        refract: 1
      },
      ui: {
        label: "mode",
        control: "dropdown"
      }
    },
    displaceSource: {
      type: "int",
      default: 1,
      uniform: "displaceSource",
      choices: {
        "inputTex": 0,
        "tex": 1
      },
      ui: {
        label: "map source",
        control: "dropdown"
      }
    },
    intensity: {
      type: "float",
      default: 50,
      uniform: "intensity",
      min: 0,
      max: 100,
      ui: {
        label: "intensity",
        control: "slider"
      }
    },
    direction: {
      type: "float",
      default: 0,
      uniform: "direction",
      min: 0,
      max: 360,
      ui: {
        label: "direction",
        control: "slider"
      }
    },
    wrap: {
      type: "int",
      default: 0,
      uniform: "wrap",
      choices: {
        clamp: 2,
        mirror: 0,
        repeat: 1
      },
      ui: {
        label: "wrap",
        control: "dropdown"
      }
    },
    smoothing: {
      type: "float",
      default: 1,
      uniform: "smoothing",
      min: 1,
      max: 100,
      ui: {
        label: "smoothing",
        control: "slider"
      }
    },
    aberration: {
      type: "float",
      default: 0,
      uniform: "aberration",
      min: 0,
      max: 100,
      ui: {
        label: "aberration",
        control: "slider"
      }
    }
  },
  passes: [
    {
      name: "render",
      program: "displaceMixer",
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
