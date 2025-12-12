import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Blend",
  namespace: "classicBasics",
  func: "blend",

  description: "Configurable blend between sources",
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
        "default": 0.5,
        "min": 0,
        "max": 1,
        "uniform": "amount"
    }
},
  passes: [
    {
      name: "main",
      program: "blend",
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
