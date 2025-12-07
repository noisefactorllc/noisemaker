import { Effect } from '../../../src/runtime/effect.js';

export default new Effect({
  name: "Noise",
  namespace: "synth",
  func: "noise",
  globals: {
    "scale": {
        "type": "float",
        "default": 25,
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
        "type": "int",
        "default": 1,
        "uniform": "colorMode",
        "choices": {
            "mono": 0,
            "rgb": 1
        },
        "ui": {
            "label": "color mode",
            "control": "dropdown"
        }
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
