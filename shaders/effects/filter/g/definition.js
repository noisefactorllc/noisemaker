import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "G",
  namespace: "filter",
  func: "g",

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
      "inputTex": "inputTex"
},
      outputs: {
        color: "outputTex"
      }
    }
  ]
})
