import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Spectrum",
  namespace: "synth",
  func: "spectrum",
  tags: ["audio"],

  description: "Audio spectrum analyzer",
  globals: {
    "color": {
        "type": "color",
        "default": [0, 1, 0],
        "uniform": "lineColor",
        "ui": {
            "label": "color",
            "control": "color"
        }
    },
    "thickness": {
        "type": "float",
        "default": 2.0,
        "min": 0.5,
        "max": 10,
        "step": 0.5,
        "uniform": "lineThickness",
        "ui": {
            "label": "thickness",
            "control": "slider"
        }
    },
    "gain": {
        "type": "float",
        "default": 1.0,
        "min": 0.1,
        "max": 5.0,
        "step": 0.1,
        "uniform": "gain",
        "ui": {
            "label": "gain",
            "control": "slider"
        }
    }
  },
  passes: [
    {
      name: "main",
      program: "spectrum",
      inputs: {},
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
