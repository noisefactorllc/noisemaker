import { Effect } from '../../../src/runtime/effect.js'

/**
 * Ridge
 * Ridge/crease enhancement with configurable midpoint
 */
export default new Effect({
  name: "Ridge",
  namespace: "filter",
  func: "ridge",

  description: "Ridge/crease enhancement",
  globals: {
    level: {
      type: "float",
      default: 0.5,
      uniform: "level",
      min: 0,
      max: 1,
      step: 0.01,
      ui: {
        label: "level",
        control: "slider"
      }
    }
  },
  passes: [
    {
      name: "main",
      program: "ridge",
      inputs: {
        inputTex: "inputTex"
      },
      uniforms: {
        level: "level"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
