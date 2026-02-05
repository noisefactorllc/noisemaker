import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Scroll",
  namespace: "filter",
  func: "scroll",
  tags: ["transform"],

  description: "Scrolling offset animation",
  globals: {
    "x": {
        "type": "float",
        "default": 0,
        "min": -10,
        "max": 10,
        "uniform": "x",
        ui: {
            label: "x"
        }},
    "y": {
        "type": "float",
        "default": 0,
        "min": -10,
        "max": 10,
        "uniform": "y",
        ui: {
            label: "y"
        }},
    "speedX": {
        "type": "float",
        "default": 0,
        "min": -10,
        "max": 10,
        "uniform": "speedX",
        ui: {
            label: "speed x"
        }},
    "speedY": {
        "type": "float",
        "default": 0,
        "min": -10,
        "max": 10,
        "uniform": "speedY",
        ui: {
            label: "speed y"
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
        "ui": {
            "label": "wrap",
            "control": "dropdown"
        }
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
