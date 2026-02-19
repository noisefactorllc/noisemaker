import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Tile",
  namespace: "filter",
  func: "tile",
  tags: ["transform"],
  description: "Symmetry-based kaleidoscope tiler",
  globals: {
    symmetry: {
      type: "int",
      default: 0,
      uniform: "symmetry",
      choices: {
        "mirrorXY": 0,
        "rotate2": 1,
        "rotate4": 2,
        "rotate6": 3
      },
      ui: {
        label: "symmetry",
        control: "dropdown"
      }
    },
    scale: {
      type: "float",
      default: 1.0,
      min: 0.1,
      max: 4.0,
      step: 0.05,
      uniform: "scale",
      ui: {
        label: "scale",
        control: "slider"
      }
    },
    offsetX: {
      type: "float",
      default: 0.0,
      min: -1.0,
      max: 1.0,
      step: 0.01,
      uniform: "offsetX",
      ui: {
        label: "offset x",
        control: "slider"
      }
    },
    offsetY: {
      type: "float",
      default: 0.0,
      min: -1.0,
      max: 1.0,
      step: 0.01,
      uniform: "offsetY",
      ui: {
        label: "offset y",
        control: "slider"
      }
    },
    angle: {
      type: "float",
      default: 0.0,
      min: 0.0,
      max: 360.0,
      step: 1.0,
      uniform: "angle",
      ui: {
        label: "angle",
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
    }
  },
  passes: [
    {
      name: "main",
      program: "tile",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
