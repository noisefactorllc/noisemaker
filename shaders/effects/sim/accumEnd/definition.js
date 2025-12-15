import { Effect } from '../../../src/runtime/effect.js'

/**
 * accumEnd - Complete accumulator feedback loop
 *
 * Writes the chain result back to the shared accumulator buffer,
 * completing the feedback loop started by accumStart.
 *
 * Usage:
 *   accumStart(alpha: 50).blur().accumEnd()
 *
 * This writes the final processed result back to the same accumulator
 * texture that accumStart reads from, creating a feedback loop.
 */
export default new Effect({
  name: "AccumEnd",
  namespace: "sim",
  func: "accumEnd",
  tags: ["util"],

  description: "End accumulator loop, write back to feedback buffer",
  globals: {},
  passes: [
    {
      name: "feedback",
      program: "copy",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "global_accum"
      }
    },
    {
      name: "output",
      program: "copy",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
