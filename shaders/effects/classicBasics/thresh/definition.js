import { Effect } from '../../../src/runtime/effect.js';

export default new Effect({
  name: "Thresh",
  namespace: "nd",
  func: "thresh",

  description: "Threshold/step function",
  globals: {
    "level": {
        "type": "float",
        "default": 0.5,
        "min": 0,
        "max": 1,
        "uniform": "level"
    },
    "sharpness": {
        "type": "float",
        "default": 0.5,
        "min": 0,
        "max": 1,
        "uniform": "sharpness"
    }
},
  passes: [
    {
      name: "main",
      program: "thresh",
      inputs: {
      "tex0": "inputTex"
},
      outputs: {
        color: "outputTex"
      }
    }
  ]
});
