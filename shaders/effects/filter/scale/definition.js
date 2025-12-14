import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Scale",
  namespace: "filter",
  func: "scale",
  tags: ["transform"],

  description: "Scale transform",
  globals: {
    "x": {
        "type": "float",
        "default": 1,
        "min": 0,
        "max": 10,
        "uniform": "scaleX"
    },
    "y": {
        "type": "float",
        "default": 0,
        "min": 0,
        "max": 10,
        "uniform": "scaleY"
    },
    "centerX": {
        "type": "float",
        "default": 0.5,
        "min": 0,
        "max": 1,
        "uniform": "centerX"
    },
    "centerY": {
        "type": "float",
        "default": 0.5,
        "min": 0,
        "max": 1,
        "uniform": "centerY"
    }
},
  passes: [
    {
      name: "main",
      program: "scale",
      inputs: {
      "inputTex": "inputTex"
},
      outputs: {
        color: "outputTex"
      }
    }
  ]
})
