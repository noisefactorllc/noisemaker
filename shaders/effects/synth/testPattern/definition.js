import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Test Pattern",
  namespace: "synth",
  func: "testPattern",
  tags: ["util"],

  description: "Test patterns for debugging and calibration",
  globals: {
    pattern: {
      type: "int",
      default: 0,
      uniform: "pattern",
      choices: { checkerboard: 0, colorBars: 1, gradient: 2, uvMap: 3, gridLines: 4, colorGrid: 5, dotGrid: 6 },
      ui: { label: "pattern", control: "dropdown" }
    },
    gridSize: {
      type: "int",
      default: 4,
      min: 1,
      max: 16,
      uniform: "gridSize",
      ui: {
        label: "grid size",
        control: "slider",
        enabledBy: { param: "pattern", in: [0, 4, 5, 6] }
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
