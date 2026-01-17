import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Osc2D",
  namespace: "synth",
  func: "osc2d",
  tags: ["geometric"],

  description: "2D oscillator pattern",
  globals: {
    "oscType": {
        "type": "member",
        "default": "oscType.sine",
        "enum": "oscType",
        "uniform": "oscType"
    },
    "frequency": {
        "type": "int",
        "default": 1,
        "min": 1,
        "max": 32,
        "step": 1,
        "uniform": "frequency"
    },
    "speed": {
        "type": "float",
        "default": 4.0,
        "min": 0,
        "max": 10,
        "step": 0.1,
        "uniform": "speed"
    },
    "rotation": {
        "type": "float",
        "default": 0,
        "min": -180,
        "max": 180,
        "step": 1,
        "uniform": "rotation"
    },
    "seed": {
        "type": "int",
        "default": 0,
        "min": 0,
        "max": 1000,
        "uniform": "seed",
        "ui": {
          label: "seed",
          control: "slider",
          enabledBy: { param: "oscType", in: ["oscType.noise1d", "oscType.noise2d"] }
        }
    }
  },
  passes: [
    {
      name: "main",
      program: "osc2d",
      inputs: {},
      outputs: {
        color: "outputTex"
      }
    }
  ]
})
