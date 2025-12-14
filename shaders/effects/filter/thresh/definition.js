import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Thresh",
  namespace: "filter",
  func: "thresh",

  description: "Threshold/step function",
  globals: {
    "level": {
        "type": "float",
        "default": 0.5,
        "min": 0,
        "max": 1,
        "uniform": "level"
    },
    "sharpness": {
        "type": "float",
        "default": 0.5,
        "min": 0,
        "max": 1,
        "uniform": "sharpness"
    }
},
  passes: [
    {
      name: "main",
      program: "thresh",
      inputs: {
      "inputTex": "inputTex"
},
      outputs: {
        color: "outputTex"
      }
    }
  ]
})
