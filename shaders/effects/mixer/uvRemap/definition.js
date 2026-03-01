import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "UvRemap",
  namespace: "mixer",
  func: "uvRemap",
  tags: ["blend", "distortion"],

  description: "Remap UVs of one input using color channels of another",
  globals: {
    tex: {
      type: "surface",
      default: "none",
      ui: { label: "source b" }
    },
    mapSource: {
      type: "int",
      default: 0,
      uniform: "mapSource",
      choices: {
        sourceA: 0,
        sourceB: 1
      },
      ui: {
        label: "map source",
        control: "dropdown"
      }
    },
    channel: {
      type: "int",
      default: 0,
      uniform: "channel",
      choices: {
        redGreen: 0,
        redBlue: 1,
        greenBlue: 2
      },
      ui: {
        label: "channel",
        control: "dropdown"
      }
    },
    scale: {
      type: "float",
      default: 100.0,
      uniform: "scale",
      min: 0,
      max: 200,
      ui: { label: "scale", control: "slider" }
    },
    offset: {
      type: "float",
      default: 0.0,
      uniform: "offset",
      min: -1,
      max: 1,
      ui: { label: "offset", control: "slider" }
    },
    wrap: {
      type: "int",
      default: 1,
      uniform: "wrap",
      choices: {
        clamp: 0,
        mirror: 1,
        repeat: 2
      },
      ui: {
        label: "wrap",
        control: "dropdown"
      }
    }
  },
  passes: [
    {
      name: "render",
      program: "uvRemap",
      inputs: { inputTex: "inputTex", tex: "tex" },
      outputs: { fragColor: "outputTex" }
    }
  ]
})
