import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Alpha Mask",
  namespace: "mixer",
  func: "alphaMask",
  tags: ["blend"],

  description: "Alpha transparency blend",
  globals: {
    tex: {
      type: "surface",
      default: "none",
      ui: { label: "source b" }
    },
    mix: {
      type: "float",
      default: 0,
      uniform: "mixAmt",
      min: -100,
      max: 100,
      ui: { label: "mix", control: "slider" }
    }
  },
  paramAliases: { mixAmt: 'mix' },
  passes: [
    {
      name: "render",
      program: "alphaMask",
      inputs: { inputTex: "inputTex", tex: "tex" },
      outputs: { fragColor: "outputTex" }
    }
  ]
})
