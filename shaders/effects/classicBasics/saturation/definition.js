import { Effect } from '../../../src/runtime/effect.js';

export default new Effect({
  name: "Sat",
  namespace: "classicBasics",
  func: "saturation",

  description: "Saturation adjustment",
  globals: {
    "a": {
        "type": "float",
        "default": 1,
        "min": 0,
        "max": 10,
        "uniform": "a"
    }
},
  passes: [
    {
      name: "main",
      program: "sat",
      inputs: {
      "tex0": "inputTex"
},
      outputs: {
        color: "outputTex"
      }
    }
  ]
});
