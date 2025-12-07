import { Effect } from '../../../src/runtime/effect.js';

export default new Effect({
  name: "Sum",
  namespace: "classicBasics",
  func: "sum",

  description: "Sum blend with clamping",
  globals: {
    "scale": {
        "type": "float",
        "default": 1,
        "min": -10,
        "max": 10,
        "uniform": "scale"
    }
},
  passes: [
    {
      name: "main",
      program: "sum",
      inputs: {
      "tex0": "inputTex"
},
      outputs: {
        color: "outputTex"
      }
    }
  ]
});
