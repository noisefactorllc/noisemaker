import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Perlin",
  namespace: "synth",
  func: "perlin",
  tags: ["noise"],

  description: "Perlin-like noise with a periodic Z",
  globals: {
    "scale": {
        "type": "float",
        "default": 25,
        "min": 0,
        "max": 100,
        "randMin": 15,
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
    "dimensions": {
        "type": "int",
        "default": 2,
        "min": 2,
        "max": 3,
        "uniform": "dimensions"
    },
    "ridges": {
        "type": "boolean",
        "default": false,
        "uniform": "ridges"
    },
    "seed": {
        "type": "int",
        "default": 0,
        "min": 0,
        "max": 100,
        "uniform": "seed"
    },
    "speed": {
        "type": "int",
        "default": 1,
        "min": 0,
        "max": 5,
        "uniform": "speed"
    }
  },
  passes: [
    {
      name: "main",
      program: "perlin",
      inputs: {},
      outputs: {
        color: "outputTex"
      }
    }
  ]
})
