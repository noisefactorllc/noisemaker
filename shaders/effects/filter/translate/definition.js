import { Effect } from '../../../src/runtime/effect.js'

/**
 * nu/translate - Translate image X and Y
 */
export default new Effect({
  name: "Translate",
  namespace: "filter",
  func: "translate",
  tags: ["transform"],

  description: "Translate image in X and Y",
  globals: {
    x: {
      type: "float",
      default: 0,
      uniform: "translateX",
      min: -1,
      max: 1,
      step: 0.01,
      ui: {
        label: "X",
        control: "slider"
      }
    },
    y: {
      type: "float",
      default: 0,
      uniform: "translateY",
      min: -1,
      max: 1,
      step: 0.01,
      ui: {
        label: "Y",
        control: "slider"
      }
    },
    wrap: {
      type: "int",
      default: 1,
      uniform: "wrap",
      choices: {
        mirror: 0,
        repeat: 1,
        clamp: 2
      },
      ui: {
        label: "Wrap",
        control: "dropdown"
      }
    }
  },
  passes: [
    {
      name: "render",
      program: "translate",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
