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
            "label": "color",
            "control": "color"
        }
    },
    "alpha": {
        "type": "float",
        "default": 0.5,
        "min": 0,
        "max": 1,
        "randMin": 0.5,
        "uniform": "alpha",
        "ui": {
            "label": "amount",
            "control": "slider"
        }
    },
    "mode": {
        "type": "int",
        "default": 0,
        "uniform": "mode",
        "choices": {
            "overlay": 0,
            "multiply": 1,
            "recolor": 2
        },
        "ui": {
            "label": "mode",
            "control": "dropdown"
        }
    }
  },
  defaultProgram: "search filter, synth\n\nnoise(ridges: true, colorMode: mono)\n.tint(color: #ff0000, alpha: 0.5, mode: overlay)\n.write(o0)",
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
