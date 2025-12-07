import { Effect } from '../../../src/runtime/effect.js';

export default new Effect({
  name: "Col",
  namespace: "classicBasics",
  func: "color",
  globals: {
    "r": {
        "type": "float",
        "default": 1,
        "min": 0,
        "max": 1,
        "uniform": "r"
    },
    "g": {
        "type": "float",
        "default": 1,
        "min": 0,
        "max": 1,
        "uniform": "g"
    },
    "b": {
        "type": "float",
        "default": 1,
        "min": 0,
        "max": 1,
        "uniform": "b"
    }
},
  passes: [
    {
      name: "main",
      program: "col",
      inputs: {
      "tex0": "inputTex"
},
      outputs: {
        color: "outputTex"
      }
    }
  ]
});
