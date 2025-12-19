import { Effect } from '../../../src/runtime/effect.js'

/**
 * end - Complete accumulator feedback loop
 *
 * Writes the chain result back to the shared accumulator buffer,
 * completing the feedback loop started by loop.begin.
 *
 * Usage:
 *   loop.begin(alpha: 50).blur().loop.end()
 *
 * This writes the final processed result back to the same accumulator
 * texture that loop.begin reads from, creating a feedback loop.
 */
export default new Effect({
  name: "LoopEnd",
  func: "loopEnd",
  namespace: "loop",
  tags: ["util", "sim"],

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
