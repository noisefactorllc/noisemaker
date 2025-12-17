import { Effect } from '../../../src/runtime/effect.js'

/**
 * filter/flipMirror - Flip and mirror image transformations
 *
 * Provides horizontal/vertical flipping and various mirroring modes
 * including left-to-right, right-to-left, up-to-down, down-to-up,
 * and combined mirroring options.
 */
export default new Effect({
  name: "FlipMirror",
  namespace: "filter",
  func: "flipMirror",
  tags: ["distort"],

  description: "Flip and mirror image transformations",
  globals: {
    mode: {
      type: "int",
      default: 0,
      uniform: "flipMode",
      choices: {
        none: 0,
        all: 1,
        horizontal: 2,
        vertical: 3,
        mirrorLtoR: 11,
        mirrorRtoL: 12,
        mirrorUtoD: 13,
        mirrorDtoU: 14,
        mirrorLtoRUtoD: 15,
        mirrorLtoRDtoU: 16,
        mirrorRtoLUtoD: 17,
        mirrorRtoLDtoU: 18
      },
      ui: {
        label: "Mode",
        control: "dropdown"
      }
    }
  },
  passes: [
    {
      name: "render",
      program: "flipMirror",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
