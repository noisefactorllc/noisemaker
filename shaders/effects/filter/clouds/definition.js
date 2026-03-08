import { Effect } from '../../../src/runtime/effect.js'

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
  namespace: "filter",
  func: "clouds",
  tags: ["noise"],

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
        label: "speed",
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
        label: "scale",
        control: "slider"
      }
    }
  },
  textures: {
    downsampleTex: { width: "25%", height: "25%", format: "rgba16f" },
    reduce1Tex: { width: "1.5625%", height: "1.5625%", format: "rgba16f" },
    statsTex: { width: 1, height: 1, format: "rgba16f" },
    shadedTex: { width: "25%", height: "25%", format: "rgba16f" }
  },
  passes: [
    {
      name: "downsample",
      program: "cloudsDownsample",
      uniforms: {
        speed: "speed",
        scale: "scale"
      },
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
      uniforms: {},
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
      uniforms: {},
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
      uniforms: {
        speed: "speed",
        scale: "scale"
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
      uniforms: {
        speed: "speed",
        scale: "scale"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
