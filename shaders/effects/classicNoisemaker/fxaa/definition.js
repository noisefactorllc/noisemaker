import { Effect } from '../../../src/runtime/effect.js'

/**
 * FXAA
 * Fast Approximate Anti-Aliasing
 */
export default new Effect({
  name: "Fxaa",
  namespace: "classicNoisemaker",
  func: "fxaa",
  tags: ["util"],

  description: "Fast approximate anti-aliasing",
  globals: {},
  passes: [
    {
      name: "main",
      program: "fxaa",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
