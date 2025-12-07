import { Effect } from '../../../src/runtime/effect.js';

export default new Effect({
  name: "Mask",
  namespace: "classicBasics",
  func: "mask",
  globals: {
    "tex": {
        "type": "surface",
        "default": "inputTex",
        uniform: "tex",
        "ui": {
            "label": "source surface"
        }
    }
},
  passes: [
    {
      name: "main",
      program: "mask",
      inputs: {
      "tex0": "inputTex",
      "tex1": "tex"
},
      outputs: {
        color: "outputTex"
      }
    }
  ]
});
