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
    invert: {
      type: "int",
      default: 0,
      uniform: "invert",
      choices: {
        sourceA: 0,
        sourceB: 1
      },
      ui: {
        label: "edge source",
        control: "dropdown"
      }
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
      default: 15.0,
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
    speed: {
      type: "int",
      default: 1,
      uniform: "speed",
      min: 0,
      max: 5,
      zero: 0,
      ui: { label: "speed", control: "slider" }
    }
  },
  defaultProgram: "search mixer, synth\n\nsolid(color: #000000)\n.write(o0)\n\nnoise()\n.cellSplit(invert: sourceB)\n.write(o1)\n",
  passes: [
    {
      name: "render",
      program: "cellSplit",
      inputs: { inputTex: "inputTex", tex: "tex" },
      outputs: { fragColor: "outputTex" }
    }
  ]
})
