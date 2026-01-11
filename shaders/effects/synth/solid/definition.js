import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Solid",
  namespace: "synth",
  func: "solid",
  tags: ["util", "color"],

  description: "Solid color fill",
  globals: {
    "r": {
        "type": "float",
        "default": 0.5,
        "min": 0,
        "max": 1,
        "uniform": "r"
    },
    "g": {
        "type": "float",
        "default": 0.5,
        "min": 0,
        "max": 1,
        "uniform": "g"
    },
    "b": {
        "type": "float",
        "default": 0.5,
        "min": 0,
        "max": 1,
        "uniform": "b"
    },
    "a": {
        "type": "float",
        "default": 1.0,
        "min": 0,
        "max": 1,
        "randMin": 0.5,
        "uniform": "a"
    }
},
  passes: [
    {
      name: "main",
      program: "solid",
      inputs: {},
      outputs: {
        color: "outputTex"
      }
    }
  ]
})
