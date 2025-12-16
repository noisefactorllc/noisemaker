import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "CenterMask",
  namespace: "mixer",
  func: "centerMask",
  tags: ["util"],

  description: "Blend from edges (A) into center (B) using a distance mask",
  globals: {
    tex: {
      type: "surface",
      default: "inputTex",
      ui: { label: "source B (center)" }
    },
    metric: {
      type: "int",
      default: 2,
      uniform: "metric",
      choices: {
        euclidean: 0,
        manhattan: 1,
        chebyshev: 2
      },
      ui: {
        label: "distance metric",
        control: "dropdown"
      }
    },
    mixAmt: {
      type: "float",
      default: 0,
      uniform: "power",
      min: -100,
      max: 100,
      ui: { label: "mix", control: "slider" }
    }
  },
  passes: [
    {
      name: "render",
      program: "centerMask",
      inputs: { inputTex: "inputTex", tex: "tex" },
      outputs: { fragColor: "outputTex" }
    }
  ]
})
