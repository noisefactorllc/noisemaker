import { Effect } from '../../../src/runtime/effect.js';

export default new Effect({
  name: "Inv",
  namespace: "classicBasics",
  func: "invert",
  globals: {
    "a": {
        "type": "float",
        "default": 1,
        "min": 0,
        "max": 1,
        "uniform": "a"
    }
},
  passes: [
    {
      name: "main",
      program: "inv",
      inputs: {
      "tex0": "inputTex"
},
      outputs: {
        color: "outputTex"
      }
    }
  ]
});
