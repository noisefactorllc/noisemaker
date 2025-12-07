import { Effect } from '../../../src/runtime/effect.js';

export default new Effect({
  name: "Kaleid",
  namespace: "classicBasics",
  func: "kaleid",
  globals: {
    "n": {
        "type": "float",
        "default": 3,
        "min": 1,
        "max": 20,
        "uniform": "n"
    }
},
  passes: [
    {
      name: "main",
      program: "kaleid",
      inputs: {
      "tex0": "inputTex"
},
      outputs: {
        color: "outputTex"
      }
    }
  ]
});
