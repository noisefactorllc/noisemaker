import { Effect } from '../../../src/runtime/effect.js';

export default new Effect({
  name: "Hue",
  namespace: "classicBasics",
  func: "hue",
  globals: {
    "hue": {
        "type": "float",
        "default": 0.4,
        "min": -1,
        "max": 1,
        "uniform": "hue"
    }
},
  passes: [
    {
      name: "main",
      program: "hue",
      inputs: {
      "tex0": "inputTex"
},
      outputs: {
        color: "outputTex"
      }
    }
  ]
});
