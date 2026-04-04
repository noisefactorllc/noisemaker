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
      "max": 64,
      "step": 1,
      "uniform": "sides",
      "ui": {
        "label": "sides",
        "control": "slider"
      }
    },
    "radius": {
        "type": "float",
        "default": 0.5,
        "min": 0,
        "max": 1,
        "uniform": "radius",
        ui: {
            label: "radius"
        }},
    "smooth": {
        "type": "float",
        "default": 0.01,
        "min": 0,
        "max": 1,
        "zero": 0,
        "uniform": "smoothing",
        ui: {
            label: "smooth"
        }},
    "rotation": {
        "type": "float",
        "default": 0,
        "min": -180,
        "max": 180,
        "uniform": "rotation",
        "ui": {
            "label": "rotation",
            "control": "slider"
        }
    },
    "fgColor": {
        "type": "color",
        "default": [1.0, 1.0, 1.0],
        "uniform": "fgColor",
        "ui": {
            "label": "fg color",
            "control": "color",
            "category": "color"
        }
    },
    "fgAlpha": {
        "type": "float",
        "default": 1.0,
        "randMin": 0.75,
        "min": 0.0,
        "max": 1.0,
        "uniform": "fgAlpha",
        "ui": {
            "label": "fg opacity",
            "control": "slider",
            "category": "color"
        }
    },
    "bgColor": {
        "type": "color",
        "default": [0.0, 0.0, 0.0],
        "uniform": "bgColor",
        "ui": {
            "label": "bg color",
            "control": "color",
            "category": "color"
        }
    },
    "bgAlpha": {
        "type": "float",
        "default": 1.0,
        "min": 0.0,
        "max": 1.0,
        "uniform": "bgAlpha",
        "ui": {
            "label": "bg opacity",
            "control": "slider",
            "category": "color"
        }
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
