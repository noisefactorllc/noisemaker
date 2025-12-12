import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Mask",
  namespace: "classicBasics",
  func: "mask",

  description: "Alpha mask blend",
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
      "inputTex": "inputTex",
      "tex": "tex"
},
      outputs: {
        color: "outputTex"
      }
    }
  ]
})
