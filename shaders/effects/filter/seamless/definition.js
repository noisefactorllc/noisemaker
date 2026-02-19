import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Seamless",
  namespace: "filter",
  func: "seamless",
  tags: ["tiling", "transform"],
  description: "Edge-blend cross-fade for seamless tiling",
  globals: {
    blend: {
      type: "float",
      default: 0.25,
      min: 0.0,
      max: 0.5,
      step: 0.01,
      uniform: "blend",
      ui: {
        label: "blend",
        control: "slider"
      }
    },
    repeat: {
      type: "float",
      default: 2,
      min: 1,
      max: 10,
      step: 1,
      uniform: "repeatCount",
      ui: {
        label: "repeat",
        control: "slider"
      }
    },
    curve: {
      type: "int",
      default: 1,
      uniform: "curve",
      choices: {
        "linear": 0,
        "smooth": 1,
        "sharp": 2
      },
      ui: {
        label: "curve",
        control: "dropdown"
      }
    }
  },
  passes: [
    {
      name: "main",
      program: "seamless",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
