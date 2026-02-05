import { Effect } from '../../../src/runtime/effect.js'

/**
 * filter3d/flow3d - 3D agent-based flow field effect with volume accumulation
 *
 * Direct and faithful port of nu/flow to 3D.
 * Can be used standalone or chained after another 3D effect.
 *
 * Usage:
 *   flow3d(volumeSize: x32).render3d().write(o0)
 *   noise3d().flow3d().render3d().write(o0)  // uses noise3d's volume size
 *
 * If inputTex3d is provided from upstream, its dimensions take precedence
 * over volumeSize. Otherwise, allocates fresh volumes.
 *
 * Architecture:
 * - Agent state stored in 2D textures (position, color, age) with MRT
 * - Agents sample from input 3D volume (inputTex3d) for color AND flow direction
 * - Trail accumulation stored in 3D volume atlas
 * - Blend pass combines input 3D volume with trail → blended volume
 * - Multi-pass: agent -> diffuse -> deposit -> blend -> geometry
 *
 * Agent format (matching 2D flow):
 * - state1: [x, y, z, rotRand]        - 3D position + per-agent rotation random
 * - state2: [r, g, b, seed]           - color + seed
 * - state3: [age, initialized, strideRand, 0] - age, init flag, stride random
 */
export default new Effect({
  name: "Flow3D",
  namespace: "filter3d",
  func: "flow3d",
  tags: ["3d", "sim"],

  description: "3D agent-based flow field",
  textures: {
    volumeCache: {
      width: { param: 'volumeSize', default: 32 },
      height: { param: 'volumeSize', power: 2, default: 1024 },
      format: "rgba16f"
    },
    geoBuffer: {
      width: { param: 'volumeSize', default: 32 },
      height: { param: 'volumeSize', power: 2, default: 1024 },
      format: "rgba16f"
    },
    // Agent state buffers (2D, for agent grid)
    global_flow3d_state1: {
      width: 512,
      height: 512,
      format: "rgba16f"
    },
    global_flow3d_state2: {
      width: 512,
      height: 512,
      format: "rgba16f"
    },
    global_flow3d_state3: {
      width: 512,
      height: 512,
      format: "rgba16f"
    },
    // 3D trail volume as 2D atlas (volumeSize x volumeSize²)
    global_flow3d_trail: {
      width: { param: 'volumeSize', default: 32 },
      height: { param: 'volumeSize', power: 2, default: 1024 },
      format: "rgba16f"
    },
    // Blended volume (input + trail)
    global_flow3d_blended: {
      width: { param: 'volumeSize', default: 32 },
      height: { param: 'volumeSize', power: 2, default: 1024 },
      format: "rgba16f"
    }
  },
  globals: {
    "volumeSize": {
      "type": "int",
      "default": 32,
      "uniform": "volumeSize",
      "choices": {
        "x16": 16,
        "x32": 32,
        "x64": 64,
        "x128": 128
      },
      "ui": {
        "label": "volume size",
        "control": "dropdown"
      }
    },
    "behavior": {
      "type": "int",
      "default": 1,
      "uniform": "behavior",
      "choices": {
        "none": 0,
        "obedient": 1,
        "crosshatch": 2,
        "unruly": 3,
        "chaotic": 4,
        "randomMix": 5,
        "meandering": 10
      },
      "ui": {
        "label": "behavior",
        "control": "dropdown"
      }
    },
    "density": {
      "type": "float",
      "default": 20,
      "uniform": "density",
      "min": 1,
      "max": 100,
      "step": 1,
      "ui": {
        "label": "density",
        "control": "slider"
      }
    },
    "stride": {
      "type": "float",
      "default": 1,
      "uniform": "stride",
      "min": 0.1,
      "max": 10,
      "step": 0.1,
      "ui": {
        "label": "stride",
        "control": "slider"
      }
    },
    "strideDeviation": {
      "type": "float",
      "default": 0.05,
      "uniform": "strideDeviation",
      "min": 0,
      "max": 0.5,
      "step": 0.01,
      "ui": {
        "label": "stride deviation",
        "control": "slider"
      }
    },
    "kink": {
      "type": "float",
      "default": 1,
      "uniform": "kink",
      "min": 0,
      "max": 10,
      "step": 0.1,
      "ui": {
        "label": "kink",
        "control": "slider"
      }
    },
    "intensity": {
      "type": "float",
      "default": 90,
      "uniform": "intensity",
      "min": 0,
      "max": 100,
      "step": 1,
      "ui": {
        "label": "trail persistence",
        "control": "slider"
      }
    },
    "inputIntensity": {
      "type": "float",
      "default": 50,
      "uniform": "inputIntensity",
      "min": 0,
      "max": 100,
      "step": 1,
      "ui": {
        "label": "input intensity",
        "control": "slider"
      }
    },
    "lifetime": {
      "type": "float",
      "default": 30,
      "uniform": "lifetime",
      "min": 0,
      "max": 60,
      "step": 1,
      "ui": {
        "label": "lifetime",
        "control": "slider"
      }
    }
  },
  passes: [
    {
      name: "agent",
      program: "agent",
      drawBuffers: 3,
      inputs: {
        stateTex1: "global_flow3d_state1",
        stateTex2: "global_flow3d_state2",
        stateTex3: "global_flow3d_state3",
        mixerTex: "inputTex3d",
        inputGeoTex: "inputGeo"
      },
      uniforms: {
        behavior: "behavior",
        density: "density",
        stride: "stride",
        strideDeviation: "strideDeviation",
        kink: "kink",
        lifetime: "lifetime",
        volumeSize: "volumeSize"
      },
      outputs: {
        outState1: "global_flow3d_state1",
        outState2: "global_flow3d_state2",
        outState3: "global_flow3d_state3"
      }
    },
    {
      name: "diffuse",
      program: "diffuse",
      viewport: {
        width: { param: 'volumeSize', default: 32, inputOverride: 'inputTex3d' },
        height: { param: 'volumeSize', power: 2, default: 1024, inputOverride: 'inputTex3d' }
      },
      inputs: {
        sourceTex: "global_flow3d_trail"
      },
      uniforms: {
        intensity: "intensity"
      },
      outputs: {
        fragColor: "global_flow3d_trail"
      }
    },
    {
      // Copy decayed trail to write buffer before deposit
      // This ensures hardware blending works correctly after ping-pong
      name: "copy",
      program: "copy",
      viewport: {
        width: { param: 'volumeSize', default: 32, inputOverride: 'inputTex3d' },
        height: { param: 'volumeSize', power: 2, default: 1024, inputOverride: 'inputTex3d' }
      },
      inputs: {
        sourceTex: "global_flow3d_trail"
      },
      outputs: {
        fragColor: "global_flow3d_trail"
      }
    },
    {
      name: "deposit",
      program: "deposit",
      drawMode: "points",
      count: 262144,
      blend: true,
      viewport: {
        width: { param: 'volumeSize', default: 32, inputOverride: 'inputTex3d' },
        height: { param: 'volumeSize', power: 2, default: 1024, inputOverride: 'inputTex3d' }
      },
      inputs: {
        stateTex1: "global_flow3d_state1",
        stateTex2: "global_flow3d_state2"
      },
      uniforms: {
        density: "density",
        volumeSize: "volumeSize"
      },
      outputs: {
        fragColor: "global_flow3d_trail"
      }
    },
    {
      name: "blend",
      program: "blend",
      viewport: {
        width: { param: 'volumeSize', default: 32, inputOverride: 'inputTex3d' },
        height: { param: 'volumeSize', power: 2, default: 1024, inputOverride: 'inputTex3d' }
      },
      inputs: {
        mixerTex: "inputTex3d",
        trailTex: "global_flow3d_trail"
      },
      uniforms: {
        inputIntensity: "inputIntensity"
      },
      outputs: {
        fragColor: "global_flow3d_blended"
      }
    }
  ],
  outputGeo: "geoBuffer",
  outputTex3d: "global_flow3d_blended"
})
