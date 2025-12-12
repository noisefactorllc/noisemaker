import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Scroll",
  namespace: "classicBasics",
  func: "scroll",

  description: "Scrolling offset animation",
  globals: {
    "x": {
        "type": "float",
        "default": 0,
        "min": -10,
        "max": 10,
        "uniform": "x"
    },
    "y": {
        "type": "float",
        "default": 0,
        "min": -10,
        "max": 10,
        "uniform": "y"
    },
    "speedX": {
        "type": "float",
        "default": 0,
        "min": -10,
        "max": 10,
        "uniform": "speedX"
    },
    "speedY": {
        "type": "float",
        "default": 0,
        "min": -10,
        "max": 10,
        "uniform": "speedY"
    }
},
  passes: [
    {
      name: "main",
      program: "scroll",
      inputs: {
      "inputTex": "inputTex"
},
      outputs: {
        color: "outputTex"
      }
    }
  ]
})
