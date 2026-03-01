import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "DisplaceMixer",
  namespace: "classicNoisedeck",
  func: "displaceMixer",
  tags: ["distort"],

  description: "Displacement-based mixing",
  globals: {
    tex: {
      type: "surface",
      default: "none",
      ui: {
        label: "source b"
      }
    },
    mapSource: {
      type: "int",
      default: 1,
      uniform: "mapSource",
      choices: {
        "sourceA": 0,
        "sourceB": 1
      },
      ui: {
        label: "map source",
        control: "dropdown"
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
        control: "slider",
        enabledBy: { param: "mode", eq: 0 }
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
        control: "slider",
        enabledBy: { param: "mode", neq: 0 }
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
        control: "slider",
        enabledBy: { param: "mode", eq: 2 }
      }
    }
  },
  paramAliases: { displaceSource: 'mapSource' },
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
