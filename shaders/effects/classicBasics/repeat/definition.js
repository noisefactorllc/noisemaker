import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Repeat",
  namespace: "classicBasics",
  func: "repeat",

  description: "Tiling repeat",
  globals: {
    "x": {
        "type": "float",
        "default": 3,
        "min": 1,
        "max": 20,
        "uniform": "x"
    },
    "y": {
        "type": "float",
        "default": 3,
        "min": 1,
        "max": 20,
        "uniform": "y"
    },
    "offsetX": {
        "type": "float",
        "default": 0,
        "min": -1,
        "max": 1,
        "uniform": "offsetX"
    },
    "offsetY": {
        "type": "float",
        "default": 0,
        "min": -1,
        "max": 1,
        "uniform": "offsetY"
    }
},
  passes: [
    {
      name: "main",
      program: "repeat",
      inputs: {
      "inputTex": "inputTex"
},
      outputs: {
        color: "outputTex"
      }
    }
  ]
})
