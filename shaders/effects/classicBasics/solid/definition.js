import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Solid",
  namespace: "classicBasics",
  func: "solid",

  description: "Solid color fill",
  globals: {
    "r": {
        "type": "float",
        "default": 0.5,
        "min": 0,
        "max": 1,
        "uniform": "r"
    },
    "g": {
        "type": "float",
        "default": 0.5,
        "min": 0,
        "max": 1,
        "uniform": "g"
    },
    "b": {
        "type": "float",
        "default": 0.5,
        "min": 0,
        "max": 1,
        "uniform": "b"
    }
},
  passes: [
    {
      name: "main",
      program: "solid",
      inputs: {},
      outputs: {
        color: "outputTex"
      }
    }
  ]
})
