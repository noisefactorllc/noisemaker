import { Effect } from '../../../src/runtime/effect.js'

/**
 * Grime - Dusty speckles and grime overlay
 *
 * Multi-octave noise with self-refraction, Chebyshev derivative,
 * dropout specks, and sparse noise blended to dirty the input.
 */
export default new Effect({
  name: "Grime",
  namespace: "filter",
  func: "grime",
  tags: ["noise"],

  description: "Grunge/grime texture overlay",
  globals: {
    strength: {
      type: "float",
      default: 0.5,
      uniform: "strength",
      min: 0,
      max: 1,
      step: 0.01,
      zero: 0,
      ui: {
        label: "strength",
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
    }
  },
  defaultProgram: "search filter, synth\n\nsolid(color: #ffffff)\n .grime(strength: 1)\n.write(o0)",
  passes: [
    {
      name: "main",
      program: "grime",
      inputs: {
        inputTex: "inputTex"
      },
      uniforms: {
        strength: "strength",
        seed: "seed"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
