import { Effect } from '../../../src/runtime/effect.js';

export default new Effect({
  name: "Bright",
  namespace: "classicBasics",
  func: "brightness",
  globals: {
    "a": {
        "type": "float",
        "default": 0,
        "min": -1,
        "max": 1,
        "uniform": "a"
    }
},
  passes: [
    {
      name: "main",
      program: "bright",
      inputs: {
      "tex0": "inputTex"
},
      outputs: {
        color: "outputTex"
      }
    }
  ]
});
