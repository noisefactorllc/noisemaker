import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "CellSplit",
  namespace: "mixer",
  func: "cellSplit",
  tags: ["blend", "noise"],

  description: "Split between inputs using Voronoi cell regions",
  globals: {
    tex: {
      type: "surface",
      default: "none",
      ui: { label: "source b" }
    },
    mode: {
      type: "int",
      default: 0,
      uniform: "mode",
      choices: {
        edges: 0,
        split: 1
      },
      ui: {
        label: "mode",
        control: "dropdown"
      }
    },
    scale: {
      type: "float",
      default: 25.0,
      uniform: "scale",
      min: 1,
      max: 30,
      ui: { label: "scale", control: "slider" }
    },
    edgeWidth: {
      type: "float",
      default: 0.08,
      uniform: "edgeWidth",
      min: 0,
      max: 0.2,
      ui: { label: "edge width", control: "slider" }
    },
    seed: {
      type: "int",
      default: 1,
      uniform: "seed",
      min: 1,
      max: 100,
      ui: { label: "seed", control: "slider" }
    },
    invert: {
      type: "int",
      default: 0,
      uniform: "invert",
      choices: {
        off: 0,
        on: 1
      },
      ui: {
        label: "swap a/b",
        control: "dropdown"
      }
    }
  },
  passes: [
    {
      name: "render",
      program: "cellSplit",
      inputs: { inputTex: "inputTex", tex: "tex" },
      outputs: { fragColor: "outputTex" }
    }
  ]
})
