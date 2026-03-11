import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Repeat",
  namespace: "filter",
  func: "repeat",
  tags: ["tiling", "transform"],

  description: "Tiling repeat",
  globals: {
    "x": {
        "type": "float",
        "default": 3,
        "min": 1,
        "max": 20,
        "zero": 1,
        "uniform": "x",
        ui: {
            label: "repeat x"
        }},
    "y": {
        "type": "float",
        "default": 3,
        "min": 1,
        "max": 20,
        "zero": 1,
        "uniform": "y",
        ui: {
            label: "repeat y"
        }},
    "offsetX": {
        "type": "float",
        "default": 0,
        "min": -1,
        "max": 1,
        "uniform": "offsetX",
        ui: {
            label: "offset x"
        }},
    "offsetY": {
        "type": "float",
        "default": 0,
        "min": -1,
        "max": 1,
        "uniform": "offsetY",
        ui: {
            label: "offset y"
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
      program: "repeat",
      inputs: {
      "inputTex": "inputTex"
},
      outputs: {
        color: "outputTex"
      }
    }
  ]
})
