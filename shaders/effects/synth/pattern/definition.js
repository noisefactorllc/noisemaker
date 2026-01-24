import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Pattern",
  namespace: "synth",
  func: "pattern",
  tags: ["geometric", "pattern", "tiling"],

  description: "Geometric pattern generator with multiple tiling options",
  globals: {
    "patternType": {
      "type": "int",
      "default": 0,
      "uniform": "patternType",
      "choices": {
          stripes: 0,
          checkerboard: 1,
          grid: 2,
          dots: 3,
          hexagons: 4,
          diamonds: 5
      },
      "ui": {
        "label": "Pattern Type",
        "control": "dropdown"
      }
    },
    "scale": {
      "type": "float",
      "default": 15.0,
      "min": 1.0,
      "max": 20.0,
      "uniform": "scale",
      "ui": {
        "label": "Scale",
        "control": "slider"
      }
    },
    "thickness": {
      "type": "float",
      "default": 0.5,
      "min": 0.0,
      "max": 1.0,
      "uniform": "thickness",
      "ui": {
        "label": "Thickness",
        "control": "slider"
      }
    },
    "smoothness": {
      "type": "float",
      "default": 0.02,
      "min": 0.0,
      "max": 1.0,
      "uniform": "smoothness",
      "ui": {
        "label": "Smoothness",
        "control": "slider"
      }
    },
    "rotation": {
      "type": "float",
      "default": 0.0,
      "min": -180.0,
      "max": 180.0,
      "uniform": "rotation",
      "ui": {
        "label": "Rotation",
        "control": "slider"
      }
    },
    "fgColor": {
      "type": "color",
      "default": [1.0, 1.0, 1.0],
      "uniform": "fgColor",
      "ui": {
        "label": "Foreground Color",
        "control": "color",
        "category": "color"
      }
    },
    "bgColor": {
      "type": "color",
      "default": [0.0, 0.0, 0.0],
      "uniform": "bgColor",
      "ui": {
        "label": "Background Color",
        "control": "color",
        "category": "color"
      }
    }
  },
  passes: [
    {
      name: "main",
      program: "pattern",
      inputs: {},
      outputs: {
        color: "outputTex"
      }
    }
  ]
})
