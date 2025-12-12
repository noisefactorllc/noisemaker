import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Add",
  namespace: "classicBasics",
  func: "add",

  description: "Additive blend between inputs",
  globals: {
    "tex": {
        "type": "surface",
        "default": "inputTex",
        "ui": {
            "label": "source surface"
        }
    },
    "amount": {
        "type": "float",
        "default": 1,
        "min": 0,
        "max": 1,
        "uniform": "amount"
    }
},
  passes: [
    {
      name: "main",
      program: "add",
      inputs: {
      "inputTex": "inputTex",
      "tex": "tex"
},
      outputs: {
        color: "outputTex"
      }
    }
  ]
})
