import { Effect } from '../../../src/runtime/effect.js';

export default new Effect({
  name: "Gradient",
  namespace: "classicBasics",
  func: "gradient",
  globals: {
    "speed": {
        "type": "float",
        "default": 0,
        "min": -10,
        "max": 10,
        "uniform": "speed"
    }
},
  passes: [
    {
      name: "main",
      program: "gradient",
      inputs: {},
      outputs: {
        color: "outputTex"
      }
    }
  ]
});
