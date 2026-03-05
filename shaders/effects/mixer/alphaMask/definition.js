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
      ui: { label: "mix", control: "slider", enabledBy: { param: "maskMode", eq: false } }
    },
    maskMode: {
      type: "boolean",
      default: false,
      uniform: "maskMode",
      ui: { label: "grayscale mask", control: "checkbox" }
    }
  },
  paramAliases: { mixAmt: 'mix' },
  passes: [
    {
      name: "render",
      program: "alphaMask",
      inputs: { inputTex: "inputTex", tex: "tex" },
      uniforms: { mixAmt: "mix", maskMode: "maskMode" },
      outputs: { fragColor: "outputTex" }
    }
  ]
})
