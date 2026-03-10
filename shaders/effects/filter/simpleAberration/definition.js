import { Effect } from '../../../src/runtime/effect.js'

/**
 * Simple Aberration
 * Chromatic aberration effect
 */
export default new Effect({
  name: "Simple Aberration",
  namespace: "filter",
  func: "simpleAberration",
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
  defaultProgram: "search filter, synth\n\nnoise(ridges: true, colorMode: mono)\n.simpleAberration()\n.write(o0)",
  passes: [
    {
      name: "render",
      program: "chromaticAberration",
      inputs: {
        inputTex: "inputTex"
      },
      uniforms: {
        displacement: "displacement"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
