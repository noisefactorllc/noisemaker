import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "B",
  namespace: "filter",
  func: "b",

  description: "Blue channel isolation",
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
      program: "b",
      inputs: {
      "inputTex": "inputTex"
},
      outputs: {
        color: "outputTex"
      }
    }
  ]
})
