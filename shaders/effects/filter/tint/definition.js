import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Tint",
  namespace: "filter",
  func: "tint",
  tags: ["color"],

  description: "Colorize input texture with a color overlay",
  globals: {
    "color": {
        "type": "color",
        "default": [1.0, 1.0, 1.0],
        "uniform": "color",
        "ui": {
            "label": "Color",
            "control": "color"
        }
    },
    "alpha": {
        "type": "float",
        "default": 0.5,
        "min": 0,
        "max": 1,
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
      program: "colorize",
      inputs: {
        "inputTex": "inputTex"
      },
      outputs: {
        color: "outputTex"
      }
    }
  ]
})
