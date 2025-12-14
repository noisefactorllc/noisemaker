import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Apply Hue",
  namespace: "mixer",
  func: "applyHue",
  tags: ["color"],

  description: "Apply hue from source B",
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
      program: "applyHue",
      inputs: { inputTex: "inputTex", tex: "tex" },
      outputs: { fragColor: "outputTex" }
    }
  ]
})
