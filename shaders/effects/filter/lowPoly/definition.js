import { Effect } from '../../../src/runtime/effect.js'

/**
 * Low Poly - Voronoi-based low-polygon art style
 * Generates seed points, finds nearest for each pixel, fills cells with input color
 */
export default new Effect({
  name: "Low Poly",
  namespace: "filter",
  func: "lowPoly",
  tags: ["geometric"],

  description: "Low-polygon style render using Voronoi cells",
  globals: {
    freq: {
      type: "int",
      default: 10,
      uniform: "freq",
      min: 2,
      max: 50,
      step: 1,
      ui: {
        label: "frequency",
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
    nth: {
      type: "int",
      default: 0,
      uniform: "nth",
      min: 0,
      max: 2,
      step: 1,
      ui: {
        label: "nth",
        control: "slider"
      }
    },
    alpha: {
      type: "float",
      default: 1.0,
      uniform: "alpha",
      min: 0.0,
      max: 1.0,
      step: 0.01,
      ui: {
        label: "alpha",
        control: "slider"
      }
    }
  },
  passes: [
    {
      name: "render",
      program: "lowPoly",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
