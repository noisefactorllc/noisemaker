import { Effect } from '../../../src/runtime/effect.js'

/**
 * Degauss
 * CRT degauss effect
 */
export default new Effect({
  name: "Degauss",
  namespace: "filter",
  func: "degauss",
  tags: ["distort"],

  description: "CRT degauss effect",
  globals: {
    displacement: {
      type: "float",
      default: 0.0625,
      uniform: "displacement",
      min: 0,
      max: 0.25,
      step: 0.001,
      ui: {
        label: "displacement",
        control: "slider"
      }
    },
    direction: {
      type: "float",
      default: 0.0,
      uniform: "direction",
      min: -180,
      max: 180,
      ui: {
        label: "direction",
        control: "slider"
      }
    },
    seed: {
      type: "int",
      default: 1,
      uniform: "seed",
      min: 1,
      max: 100,
      step: 1,
      ui: {
        label: "seed",
        control: "slider"
      }
    },
    speed: {
      type: "float",
      default: 1.0,
      uniform: "speed",
      min: 0.0,
      max: 2.0,
      step: 0.1,
      ui: {
        label: "speed",
        control: "slider"
      }
    }
  },
  defaultProgram: "search filter, synth\n\ntestPattern()\n.degauss()\n.write(o0)",
  passes: [
    {
      name: "main",
      program: "degauss",
      inputs: {
        inputTex: "inputTex"
      },
      uniforms: {
        displacement: "displacement",
        speed: "speed",
        seed: "seed",
        direction: "direction"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
