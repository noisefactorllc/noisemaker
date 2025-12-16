import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Multiply",
  namespace: "mixer",
  func: "multiply",
  tags: [],

  description: "Multiply pixels, darkening result",
  globals: {
    tex: {
      type: "surface",
      default: "inputTex",
      ui: { label: "source B" }
    },
    mixAmt: {
      type: "float",
      default: 0,
      uniform: "mixAmt",
      min: -100,
      max: 100,
      ui: { label: "mix", control: "slider" }
    }
  },
  passes: [
    {
      name: "render",
      program: "multiply",
      inputs: { inputTex: "inputTex", tex: "tex" },
      outputs: { fragColor: "outputTex" }
    }
  ]
})
