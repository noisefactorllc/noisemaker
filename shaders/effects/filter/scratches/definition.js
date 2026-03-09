import { Effect } from '../../../src/runtime/effect.js'

/**
 * Scratches
 * Film scratch overlay - thin bright nearly-vertical lines with breaks
 */
export default new Effect({
  name: "Scratches",
  namespace: "filter",
  func: "scratches",
  tags: ["noise"],

  description: "Film scratch overlay",
  globals: {
    density: {
      type: "float",
      default: 0.3,
      uniform: "density",
      min: 0,
      max: 1,
      step: 0.01,
      ui: {
        label: "density",
        control: "slider"
      }
    },
    alpha: {
      type: "float",
      default: 0.75,
      uniform: "alpha",
      min: 0,
      max: 1,
      step: 0.01,
      ui: {
        label: "alpha",
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
      min: 0,
      max: 5,
      step: 0.1,
      ui: {
        label: "speed",
        control: "slider"
      }
    }
  },
  passes: [
    {
      name: "main",
      program: "scratches",
      inputs: {
        inputTex: "inputTex"
      },
      uniforms: {
        density: "density",
        alpha: "alpha",
        seed: "seed",
        speed: "speed"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
