import { Effect } from '../../../src/runtime/effect.js'

/**
 * Stray Hair - sparse dark curved lines over the image
 *
 * Single-pass procedural effect generating a small number of
 * thin, curvy dark strands resembling hairs on a camera lens.
 */
export default new Effect({
  name: "Stray Hair",
  namespace: "filter",
  func: "strayHair",
  tags: ["noise"],

  description: "Stray hair overlay",

  globals: {
    density: {
      type: "float",
      default: 0.1,
      uniform: "density",
      min: 0,
      max: 1,
      step: 0.01,
      ui: { label: "density", control: "slider" }
    },
    seed: {
      type: "int",
      default: 1,
      uniform: "seed",
      min: 1,
      max: 100,
      step: 1,
      ui: { label: "seed", control: "slider" }
    },
    alpha: {
      type: "float",
      default: 0.5,
      uniform: "alpha",
      min: 0,
      max: 1,
      step: 0.01,
      ui: { label: "alpha", control: "slider" }
    }
  },

  passes: [
    {
      name: "main",
      program: "strayHair",
      inputs: {
        inputTex: "inputTex"
      },
      uniforms: {
        density: "density",
        seed: "seed",
        alpha: "alpha"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
