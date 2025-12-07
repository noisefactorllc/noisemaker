import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "G",
  namespace: "classicBasics",
  func: "green",

  description: "Green channel adjustment",
  globals: {
    "scale": {
        "type": "float",
        "default": 1,
        "min": -10,
        "max": 10,
        "uniform": "scale"
    },
    "offset": {
        "type": "float",
        "default": 0,
        "min": -10,
        "max": 10,
        "uniform": "offset"
    }
},
  passes: [
    {
      name: "main",
      program: "g",
      inputs: {
      "tex0": "inputTex"
},
      outputs: {
        color: "outputTex"
      }
    }
  ]
})
