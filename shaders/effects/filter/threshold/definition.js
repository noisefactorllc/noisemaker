import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Threshold",
  namespace: "filter",
  func: "threshold",
  tags: ["color", "edges"],

  description: "Threshold/step function",
  globals: {
    "level": {
        "type": "float",
        "default": 0.5,
        "min": 0,
        "max": 1,
        "uniform": "level",
        ui: {
            label: "level"
        }},
    "sharpness": {
        "type": "float",
        "default": 0.5,
        "min": 0,
        "max": 1,
        "uniform": "sharpness",
        ui: {
            label: "sharpness"
        }}
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
