import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Polygon",
  namespace: "synth",
  func: "polygon",
  tags: ["geometric"],

  description: "Geometric shape generator",
  globals: {
    "sides": {
      "type": "int",
      "default": 3,
      "min": 3,
      "max": 100,
      "step": 1,
      "uniform": "sides",
      "ui": {
        "label": "Sides",
        "control": "slider"
      }
    },
    "radius": {
        "type": "float",
        "default": 0.3,
        "min": 0,
        "max": 1,
        "uniform": "radius"
    },
    "smooth": {
        "type": "float",
        "default": 0.01,
        "min": 0,
        "max": 1,
        "uniform": "smoothing"
    }
},
  passes: [
    {
      name: "main",
      program: "shape",
      inputs: {},
      outputs: {
        color: "outputTex"
      }
    }
  ]
})
