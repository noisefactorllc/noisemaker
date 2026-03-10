import { Effect } from '../../../src/runtime/effect.js'

/**
 * Normal Map
 * Normal map generation
 */
export default new Effect({
  name: "Normal Map",
  namespace: "filter",
  func: "normalMap",
  tags: ["color"],

  description: "Normal map generation",
  globals: {},
  passes: [
    {
      name: "main",
      program: "normalMap",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
