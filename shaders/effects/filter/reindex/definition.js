import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Reindex",
  namespace: "filter",
  func: "reindex",
  tags: ["color"],
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
        label: "displacement",
        control: "slider"
      }
    }
  },
  textures: {
    statsTiles: {
      format: "rgba16f"
    },
    global_stats: {
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
        fragColor: "statsTiles"
      }
    },
    {
      name: "reduce",
      program: "nmReindexReduce",
      inputs: {
        statsTex: "statsTiles"
      },
      outputs: {
        fragColor: "global_stats"
      }
    },
    {
      name: "apply",
      program: "nmReindexApply",
      inputs: {
        inputTex: "inputTex",
        statsTex: "global_stats"
      },
      uniforms: {
        uDisplacement: "displacement"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
