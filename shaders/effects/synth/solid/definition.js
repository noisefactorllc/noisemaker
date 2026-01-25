import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Solid",
  namespace: "synth",
  func: "solid",
  tags: ["color"],

  description: "Solid color fill",
  globals: {
    "color": {
        "type": "color",
        "default": [0.5, 0.5, 0.5],
        "uniform": "color",
        "ui": {
            "label": "Color",
            "control": "color"
        }
    },
    "alpha": {
        "type": "float",
        "default": 1.0,
        "min": 0,
        "max": 1,
        "randMin": 0.5,
        "uniform": "alpha",
        "ui": {
            "label": "Opacity",
            "control": "slider"
        }
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
