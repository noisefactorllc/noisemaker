import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Pixelate",
  namespace: "classicBasics",
  func: "pixelate",

  description: "Pixelation effect",
  globals: {
    "x": {
        "type": "float",
        "default": 20,
        "min": 1,
        "max": 1000,
        "uniform": "x"
    },
    "y": {
        "type": "float",
        "default": 20,
        "min": 1,
        "max": 1000,
        "uniform": "y"
    }
},
  passes: [
    {
      name: "main",
      program: "pixelate",
      inputs: {
      "inputTex": "inputTex"
},
      outputs: {
        color: "outputTex"
      }
    }
  ]
})
