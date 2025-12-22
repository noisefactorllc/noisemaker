import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Test Pattern",
  namespace: "synth",
  func: "testPattern",
  tags: ["util", "debug"],

  description: "NxN numbered checkerboard for identifying axis flips",
  globals: {
    gridSize: {
      type: "int",
      default: 4,
      min: 1,
      max: 16,
      uniform: "gridSize",
      ui: {
        label: "grid size",
        control: "slider"
      }
    }
  },
  passes: [
    {
      name: "main",
      program: "testPattern",
      inputs: {},
      outputs: {
        color: "outputTex"
      }
    }
  ]
})
