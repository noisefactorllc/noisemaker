import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Dodge",
  namespace: "mixer",
  func: "dodge",
  tags: ["math"],

  description: "Color dodge creating bright highlights",
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
      program: "dodge",
      inputs: { inputTex: "inputTex", tex: "tex" },
      outputs: { fragColor: "outputTex" }
    }
  ]
})
