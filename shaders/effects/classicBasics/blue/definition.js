import { Effect } from '../../../src/runtime/effect.js';

export default new Effect({
  name: "B",
  namespace: "classicBasics",
  func: "blue",
  globals: {
    "scale": {
        "type": "float",
        "default": 1,
        "min": -10,
        "max": 10,
        "uniform": "scale"
    },
    "offset": {
        "type": "float",
        "default": 0,
        "min": -10,
        "max": 10,
        "uniform": "offset"
    }
},
  passes: [
    {
      name: "main",
      program: "b",
      inputs: {
      "tex0": "inputTex"
},
      outputs: {
        color: "outputTex"
      }
    }
  ]
});
