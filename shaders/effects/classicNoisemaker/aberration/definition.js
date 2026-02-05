import { Effect } from '../../../src/runtime/effect.js'

/**
 * classicNoisemaker/aberration - Chromatic aberration effect
 */
export default new Effect({
  name: "Aberration",
  namespace: "classicNoisemaker",
  func: "aberration",
  tags: ["color"],

  description: "Chromatic aberration",
  globals: {
    displacement: {
      type: "float",
      default: 0.02,
      uniform: "displacement",
      min: 0,
      max: 0.1,
      step: 0.001,
      ui: {
        label: "displacement",
        control: "slider"
      }
    }
  },
  passes: [
    {
      name: "render",
      program: "chromaticAberration",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
