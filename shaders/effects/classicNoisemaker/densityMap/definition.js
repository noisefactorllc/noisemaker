import { Effect } from '../../../src/runtime/effect.js'

/**
 * Density Map
 * Normalizes image values based on min/max.
 * Uses a two-stage reduction to find global min/max.
 */
export default new Effect({
  name: "DensityMap",
  namespace: "classicNoisemaker",
  func: "densityMap",

  description: "Density-based mapping",
  globals: {},
  textures: {
    _minmax1: { width: 32, height: 32, format: "rgba32float" },
    _minmaxGlobal: { width: 1, height: 1, format: "rgba32float" }
  },
  passes: [
    {
      name: "reduce1",
      program: "reduce1",
      viewport: { width: 32, height: 32 },
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "_minmax1"
      }
    },
    {
      name: "reduce2",
      program: "reduce2",
      viewport: { width: 1, height: 1 },
      inputs: {
        inputTex: "_minmax1"
      },
      outputs: {
        fragColor: "_minmaxGlobal"
      }
    },
    {
      name: "apply",
      program: "densityMap",
      inputs: {
        inputTex: "inputTex",
        minmaxTexture: "_minmaxGlobal"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
