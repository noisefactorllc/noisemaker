import { Effect } from '../../../src/runtime/effect.js';

export default new Effect({
  name: "Translate",
  namespace: "classicBasics",
  func: "translate",
  globals: {
    "x": {
        "type": "float",
        "default": 0,
        "min": -10,
        "max": 10,
        "uniform": "x"
    },
    "y": {
        "type": "float",
        "default": 0,
        "min": -10,
        "max": 10,
        "uniform": "y"
    }
},
  passes: [
    {
      name: "main",
      program: "translate",
      inputs: {
      "tex0": "inputTex"
},
      outputs: {
        color: "outputTex"
      }
    }
  ]
});
