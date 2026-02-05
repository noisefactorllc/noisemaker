import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "CenterMask",
  namespace: "mixer",
  func: "centerMask",
  tags: ["blend"],

  description: "Blend from edges (A) into center (B) using a distance mask",
  globals: {
    tex: {
      type: "surface",
      default: "none",
      ui: { label: "source b (center)" }
    },
    blendMode: {
      type: "int",
      default: 8,
      uniform: "blendMode",
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
        label: "blend mode",
        control: "dropdown"
      }
    },
    shape: {
      type: "int",
      default: 2,
      uniform: "metric",
      choices: {
        circle: 0,
        diamond: 1,
        square: 2
      },
      ui: {
        label: "shape",
        control: "dropdown"
      }
    },
    hardness: {
      type: "float",
      default: 0,
      uniform: "hardness",
      min: 0,
      max: 100,
      ui: { label: "edge hardness", control: "slider" }
    },
    mix: {
      type: "float",
      default: 0,
      uniform: "power",
      min: -100,
      max: 100,
      randMax: -70,
      ui: { label: "mix", control: "slider" }
    }
  },
  paramAliases: { mixAmt: 'mix' },
  passes: [
    {
      name: "render",
      program: "centerMask",
      inputs: { inputTex: "inputTex", tex: "tex" },
      outputs: { fragColor: "outputTex" }
    }
  ]
})
