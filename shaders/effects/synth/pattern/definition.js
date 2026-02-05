import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Pattern",
  namespace: "synth",
  func: "pattern",
  tags: ["geometric", "pattern"],

  description: "Geometric pattern generator",
  globals: {
    "type": {
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
        "label": "pattern type",
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
        "label": "scale",
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
        "label": "thickness",
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
        "label": "smoothness",
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
        "label": "rotation",
        "control": "slider"
      }
    },
    "fgColor": {
      "type": "color",
      "default": [1.0, 1.0, 1.0],
      "uniform": "fgColor",
      "ui": {
        "label": "foreground color",
        "control": "color",
        "category": "color"
      }
    },
    "bgColor": {
      "type": "color",
      "default": [0.0, 0.0, 0.0],
      "uniform": "bgColor",
      "ui": {
        "label": "background color",
        "control": "color",
        "category": "color"
      }
    }
  },
  paramAliases: { patternType: 'type' },
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
