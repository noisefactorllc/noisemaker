import { Effect } from '../../../src/runtime/effect.js'

/**
 * accumStart - Start accumulator feedback loop
 *
 * Reads from a shared accumulator buffer and blends with the incoming texture
 * using lighten (max) mode. Use accumEnd to complete the feedback loop.
 *
 * Usage:
 *   accumStart(alpha: 50).blur().accumEnd()
 *
 * This is equivalent to manually setting up:
 *   noise().write(o0)
 *   read(o1).lighten(tex: read(o0)).blur().write(o1)
 */
export default new Effect({
  name: "AccumStart",
  namespace: "sim",
  func: "accumStart",
  tags: ["util"],

  description: "Start accumulator loop with lighten blend",
  globals: {
    alpha: {
      type: "float",
      default: 50,
      min: 0,
      max: 100,
      uniform: "alpha",
      ui: {
        label: "alpha",
        control: "slider"
      }
    },
    intensity: {
      type: "float",
      default: 100,
      min: 0,
      max: 100,
      uniform: "intensity",
      ui: {
        label: "intensity",
        control: "slider"
      }
    }
  },
  passes: [
    {
      name: "accumBlend",
      program: "accumStart",
      inputs: {
        inputTex: "inputTex",
        accumTex: "global_accum"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
