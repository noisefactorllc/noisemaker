import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "BlendMode",
  namespace: "mixer",
  func: "blendMode",
  tags: [],

  description: "Blend two inputs using selectable blend mode",
  globals: {
    tex: {
      type: "surface",
      default: "inputTex",
      ui: { label: "source B" }
    },
    mode: {
      type: "int",
      default: 0,
      uniform: "mode",
      choices: {
        add: 0,
        burn: 1,
        darken: 2,
        diff: 3,
        dodge: 4,
        exclusion: 5,
        hardLight: 6,
        lighten: 7,
        mix: 8,
        multiply: 9,
        negation: 10,
        overlay: 11,
        phoenix: 12,
        screen: 13,
        softLight: 14,
        subtract: 15
      },
      ui: {
        label: "mode",
        control: "dropdown"
      }
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
      program: "blendMode",
      inputs: { inputTex: "inputTex", tex: "tex" },
      outputs: { fragColor: "outputTex" }
    }
  ]
})
