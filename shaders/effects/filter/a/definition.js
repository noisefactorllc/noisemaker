import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "A",
  namespace: "filter",
  func: "a",

  description: "Alpha transparency blend",
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
      program: "a",
      inputs: {
      "inputTex": "inputTex"
},
      outputs: {
        color: "outputTex"
      }
    }
  ]
})
