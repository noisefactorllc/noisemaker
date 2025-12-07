import { Effect } from '../../../src/runtime/effect.js';

export default new Effect({
  name: "Cont",
  namespace: "classicBasics",
  func: "contrast",

  description: "Contrast adjustment",
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
      program: "cont",
      inputs: {
      "tex0": "inputTex"
},
      outputs: {
        color: "outputTex"
      }
    }
  ]
});
