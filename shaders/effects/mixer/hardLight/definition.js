import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Hard Light",
  namespace: "mixer",
  func: "hardLight",

  description: "Multiply/screen based on blend layer",
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
      program: "hardLight",
      inputs: { inputTex: "inputTex", tex: "tex" },
      outputs: { fragColor: "outputTex" }
    }
  ]
})
