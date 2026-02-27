import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Apply Mode",
  namespace: "mixer",
  func: "applyMode",
  tags: ["color"],

  description: "Apply brightness, hue, or saturation from source B to source A",
  globals: {
    tex: {
      type: "surface",
      default: "none",
      ui: { label: "source b" }
    },
    mode: {
      type: "int",
      default: 0,
      uniform: "mode",
      choices: {
        brightness: 0,
        hue: 1,
        saturation: 2
      },
      ui: {
        label: "mode",
        control: "dropdown"
      }
    },
    mix: {
      type: "float",
      default: 0,
      uniform: "mix",
      min: -100,
      max: 100,
      ui: { label: "mix", control: "slider" }
    }
  },
  paramAliases: { mixAmt: 'mix' },
  passes: [
    {
      name: "render",
      program: "applyMode",
      inputs: { inputTex: "inputTex", tex: "tex" },
      uniforms: { mixAmt: "mix" },
      outputs: { fragColor: "outputTex" }
    }
  ]
})
