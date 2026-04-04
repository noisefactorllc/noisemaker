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
        "default": 0.5,
        "min": 0,
        "max": 10,
        zero: 1,
        "uniform": "scaleX",
        ui: {
            label: "scale x"
        }},
    "y": {
        "type": "float",
        "default": 0.5,
        "min": 0,
        "max": 10,
        zero: 1,
        "uniform": "scaleY",
        ui: {
            label: "scale y"
        }},
    "centerX": {
        "type": "float",
        "default": 0.5,
        "min": 0,
        "max": 1,
        "uniform": "centerX",
        ui: {
            label: "center x"
        }},
    "centerY": {
        "type": "float",
        "default": 0.5,
        "min": 0,
        "max": 1,
        "uniform": "centerY",
        ui: {
            label: "center y"
        }},
    "wrap": {
        "type": "int",
        "default": 1,
        "uniform": "wrap",
        "choices": {
            "mirror": 0,
            "repeat": 1,
            "clamp": 2
        },
        "randChoices": [0, 1],
        "ui": {
            "label": "wrap",
            "control": "dropdown"
        }
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
