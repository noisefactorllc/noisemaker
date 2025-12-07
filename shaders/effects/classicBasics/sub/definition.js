import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Sub",
  namespace: "classicBasics",
  func: "sub",

  description: "Subtractive blend",
  globals: {
    "amount": {
        "type": "float",
        "default": 1,
        "min": 0,
        "max": 1,
        "uniform": "amount"
    },
    "tex": {
      "type": "surface",
      "default": "inputTex",
      "ui": {
        "label": "source surface"
      }
    }
},
  passes: [
    {
      name: "main",
      program: "sub",
      inputs: {
      "tex0": "inputTex",
      "tex1": "tex"
},
      outputs: {
        color: "outputTex"
      }
    }
  ]
})
