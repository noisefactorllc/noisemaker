import { Effect } from '../../../src/runtime/effect.js';

export default new Effect({
  name: "Noise",
  namespace: "classicBasics",
  func: "noise",
  globals: {
    "scale": {
        "type": "float",
        "default": 3,
        "min": 0,
        "max": 100,
        "uniform": "scale"
    },
    "octaves": {
        "type": "int",
        "default": 1,
        "min": 1,
        "max": 6,
        "uniform": "octaves"
    },
    "colorMode": {
        "type": "member",
        "default": "color.rgb",
        "enum": "color",
        "uniform": "colorMode"
    },
    "hueRotation": {
        "type": "float",
        "default": 0,
        "min": 0,
        "max": 360
    },
    "hueRange": {
        "type": "float",
        "default": 0.5,
        "min": 0,
        "max": 1,
        "uniform": "hueRange"
    },
    "ridges": {
        "type": "boolean",
        "default": false,
        "uniform": "ridges"
    },
    "seed": {
        "type": "float",
        "default": 0,
        "min": 0,
        "max": 100,
        "uniform": "seed"
    }
},
  passes: [
    {
      name: "main",
      program: "noise",
      inputs: {},
      outputs: {
        color: "outputTex"
      }
    }
  ]
});
