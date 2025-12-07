import { Effect } from '../../../src/runtime/effect.js';

export default new Effect({
  name: "Diff",
  namespace: "classicBasics",
  func: "diff",

  description: "Absolute difference blend",
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
      program: "diff",
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
