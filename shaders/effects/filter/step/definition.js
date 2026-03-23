import { Effect } from '../../../src/runtime/effect.js'

/**
 * nu/step - Adjustable step threshold
 * Creates hard edge at threshold value
 */
export default new Effect({
  name: "Step",
  namespace: "filter",
  func: "step",
  tags: ["edges", "util"],

  description: "Hard threshold at specified value",
  globals: {
    threshold: {
      type: "float",
      default: 0.5,
      uniform: "threshold",
      min: 0,
      max: 1,
      randMin: 0.25,
      randMax: 0.75,
      step: 0.01,
      ui: {
        label: "threshold",
        control: "slider"
      }
    },
    antialias: {
      type: "boolean",
      default: true,
      uniform: "antialias",
      ui: {
        label: "antialias",
        control: "checkbox"
      }
    }
  },
  passes: [
    {
      name: "render",
      program: "step",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
