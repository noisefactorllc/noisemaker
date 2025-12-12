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
      "inputTex": "inputTex",
      "tex": "tex"
},
      outputs: {
        color: "outputTex"
      }
    }
  ]
})
