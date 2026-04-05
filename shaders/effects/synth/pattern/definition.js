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
      "default": 7,
      "uniform": "patternType",
      "choices": {
          checkerboard: 0,
          concentricRings: 1,
          dots: 2,
          grid: 3,
          hearts: 9,
          hexagons: 4,
          radialLines: 5,
          spiral: 6,
          stripes: 7,
          triangularGrid: 8,
          waves: 10,
          zigzag: 11
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
    "animation": {
      "type": "int",
      "default": 0,
      "uniform": "animation",
      "choices": {
        none: 0,
        panX: 1,
        panY: 2,
        rotate: 3
      },
      "ui": {
        "label": "animation",
        "control": "dropdown",
        "category": "animation",
        "enabledBy": { "param": "type", "notIn": [1, 5, 6] }
      }
    },
    "speed": {
      "type": "int",
      "default": 1,
      "uniform": "speed",
      "min": -5,
      "max": 5,
      "zero": 0,
      "ui": {
        "label": "speed",
        "control": "slider",
        "category": "animation",
        "enabledBy": {
          "or": [
            { "param": "type", "in": [1, 5, 6] },
            { "and": [ { "param": "animation", "neq": 0 }, { "param": "type", "notIn": [1, 5, 6] }]},
          ]
        }
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
    "bgColor": {
      "type": "color",
      "default": [0.0, 0.0, 0.0],
      "uniform": "bgColor",
      "ui": {
        "label": "bg color",
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
