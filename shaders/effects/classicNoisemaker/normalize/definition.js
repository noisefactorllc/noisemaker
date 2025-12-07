import { Effect } from '../../../src/runtime/effect.js';

/**
 * Normalize - GPGPU Implementation
 * 
 * Multi-pass GPGPU pipeline for image normalization:
 * 1. reduce: 16:1 pyramid reduction, compute per-block min/max RGB
 * 2. reduce_minmax: 16:1 reduction of min/max values  
 * 3. stats_final: Reduce to single global min/max
 * 4. apply: Normalize each pixel using global stats
 * 
 * For 800x600: 800/16=50, 600/16=38 → 50x38 → 4x3 → 1x1
 */
export default new Effect({
  name: "Normalize",
  namespace: "classicNoisemaker",
  func: "normalize",

  description: "Value normalization",
  globals: {},
  textures: {
    // Pyramid reduction textures
    reduce1: { width: "6.25%", height: "6.25%", format: "rgba16f" },  // 1/16
    reduce2: { width: "0.4%", height: "0.4%", format: "rgba16f" },    // 1/256  
    stats: { width: 1, height: 1, format: "rgba16f" }                 // Final 1x1
  },
  passes: [
    {
      name: "reduce",
      program: "reduce",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "reduce1"
      }
    },
    {
      name: "reduceMinmax",
      program: "reduceMinmax",
      inputs: {
        inputTex: "reduce1"
      },
      outputs: {
        fragColor: "reduce2"
      }
    },
    {
      name: "statsFinal",
      program: "statsFinal",
      inputs: {
        inputTex: "reduce2"
      },
      outputs: {
        fragColor: "stats"
      }
    },
    {
      name: "apply",
      program: "apply",
      inputs: {
        inputTex: "inputTex",
        statsTex: "stats"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
});
