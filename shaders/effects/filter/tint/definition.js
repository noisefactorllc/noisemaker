import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Tint",
  namespace: "filter",
  func: "tint",
  tags: ["color"],

  description: "Colorize input texture by RGB value",
  globals: {
    "r": {
        "type": "float",
        "default": 1,
        "min": 0,
        "max": 1,
        "uniform": "r"
    },
    "g": {
        "type": "float",
        "default": 1,
        "min": 0,
        "max": 1,
        "uniform": "g"
    },
    "b": {
        "type": "float",
        "default": 1,
        "min": 0,
        "max": 1,
        "uniform": "b"
    }
  },
  passes: [
    {
      name: "main",
      program: "colorize",
      inputs: {
        "inputTex": "inputTex"
      },
      outputs: {
        color: "outputTex"
      }
    }
  ]
})
