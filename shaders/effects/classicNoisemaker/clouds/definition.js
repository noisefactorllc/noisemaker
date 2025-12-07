import { Effect } from '../../../src/runtime/effect.js';

/**
 * Clouds - Top-down cloud cover effect
 * 
 * Multi-pass rendering:
 * 1. Generate ridged multires noise control at 25% resolution, with warp
 * 2. Reduce to find global min/max of control for proper normalization
 * 3. Compute combined (white/black blend) and shaded (offset + blur) masks using normalized control
 * 4. Upsample and composite onto input with shadow effect
 */
export default new Effect({
  name: "Clouds",
  namespace: "classicNoisemaker",
  func: "clouds",

  description: "Cloud texture generator",
  globals: {
    speed: {
      type: "float",
      default: 1.0,
      uniform: "speed",
      min: 0.0,
      max: 3.0,
      step: 0.05,
      ui: {
        label: "Speed",
        control: "slider"
      }
    },
    scale: {
      type: "float",
      default: 0.25,
      uniform: "scale",
      min: 0.1,
      max: 1.0,
      step: 0.05,
      ui: {
        label: "Scale",
        control: "slider"
      }
    }
  },
  textures: {
    downsampleTex: { width: "25%", height: "25%", format: "rgba16f" },
    // Reduction textures for finding global min/max of control
    reduce1Tex: { width: "1.5625%", height: "1.5625%", format: "rgba16f" },  // 25% / 16
    statsTex: { width: 1, height: 1, format: "rgba16f" },  // Final 1x1 with min/max
    shadedTex: { width: "25%", height: "25%", format: "rgba16f" }
  },
  passes: [
    {
      name: "downsample",
      program: "cloudsDownsample",
      outputs: {
        fragColor: "downsampleTex"
      }
    },
    {
      name: "reduce",
      program: "cloudsReduce",
      inputs: {
        downsampleTex: "downsampleTex"
      },
      outputs: {
        fragColor: "reduce1Tex"
      }
    },
    {
      name: "stats",
      program: "cloudsStats",
      inputs: {
        reduceTex: "reduce1Tex"
      },
      outputs: {
        fragColor: "statsTex"
      }
    },
    {
      name: "shade",
      program: "cloudsShade",
      inputs: {
        downsampleTex: "downsampleTex",
        statsTex: "statsTex"
      },
      outputs: {
        fragColor: "shadedTex"
      }
    },
    {
      name: "upsample",
      program: "cloudsUpsample",
      inputs: {
        shadedTex: "shadedTex",
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
});
