import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Layer",
  namespace: "classicBasics",
  func: "layer",

  description: "Layer compositing",
  globals: {
    "tex": {
        "type": "surface",
        "default": "inputTex",
        uniform: "tex",
        "ui": {
            "label": "layer source"
        }
    }
},
  passes: [
    {
      name: "main",
      program: "layer",
      inputs: {
      "tex0": "inputTex",
      "tex1": "tex"
},
      outputs: {
        color: "outputTex"
      }
    }
  ]
})
