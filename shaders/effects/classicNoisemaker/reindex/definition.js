import { Effect } from '../../../src/runtime/effect.js'

/**
 * Reindex
 * WebGL port of the Noisemaker reindex effect.
 */
export default new Effect({
  name: "Reindex",
  namespace: "classicNoisemaker",
  func: "reindex",

  description: "Palette reindexing",
  globals: {
    displacement: {
        type: "float",
        default: 0.5,
        min: 0,
        max: 2,
        step: 0.01,
        uniform: "uDisplacement",
        ui: {
            label: "Displacement",
            control: "slider"
        }
    }
  },
  textures: {
    statsTiles: {
      format: "rgba16f"
    },
    globalStats: {
      width: 1,
      height: 1,
      format: "rgba16f"
    }
  },
  passes: [
    {
      name: "stats",
      program: "nmReindexStats",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        color: "statsTiles"
      }
    },
    {
      name: "reduce",
      program: "nmReindexReduce",
      inputs: {
        statsTex: "statsTiles"
      },
      outputs: {
        color: "globalStats"
      }
    },
    {
      name: "apply",
      program: "nmReindexApply",
      inputs: {
        inputTex: "inputTex",
        statsTex: "globalStats"
      },
      outputs: {
        color: "outputTex"
      }
    }
  ]
})
