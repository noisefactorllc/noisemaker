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
      ui: {
        label: "strength",
        control: "slider"
      }
    },
    speed: {
      type: "float",
      default: 1.0,
      uniform: "speed",
      min: 0,
      max: 5,
      step: 0.1,
      ui: {
        label: "speed",
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
  passes: [
    {
      name: "main",
      program: "grime",
      inputs: {
        inputTex: "inputTex"
      },
      uniforms: {
        strength: "strength",
        speed: "speed",
        seed: "seed",
        time: "time"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
