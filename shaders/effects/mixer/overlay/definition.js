import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Overlay",
  namespace: "mixer",
  func: "overlay",

  description: "Multiply/screen based on base layer",
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
      program: "overlay",
      inputs: { inputTex: "inputTex", tex: "tex" },
      outputs: { fragColor: "outputTex" }
    }
  ]
})
