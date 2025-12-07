import { Effect } from '../../../src/runtime/effect.js'

/**
 * Hydraulic Flow - Agent-based gradient-descent flow field effect
 *
 * Architecture (GPGPU via render passes):
 * - Uses fragment shaders with MRT for agent simulation
 * - `global`-prefixed textures get automatic ping-pong (read previous, write current)
 * - Trail accumulation via point-sprite deposit pass
 * - Multi-pass: init -> agent -> deposit -> blend
 *
 * Agent format: [x, y, x_dir, y_dir] [r, g, b, inertia] [age, 0, 0, 0]
 * Stored across 3 state textures using MRT
 * Agent count: 256x256 = 65536 agents
 *
 * Trail flow:
 *   init: copy previous trail with decay (preserves accumulation)
 *   deposit: add agent points (additive)
 *   blend: combine trail with input
 */
export default new Effect({
  name: "Hflow",
  namespace: "stateful",
  func: "hflow",

  description: "Hydraulic erosion flow simulation",
  textures: {
    globalHflowState1: { width: 256, height: 256, format: "rgba16f" },
    globalHflowState2: { width: 256, height: 256, format: "rgba16f" },
    globalHflowState3: { width: 256, height: 256, format: "rgba16f" },
    globalHflowTrail: { width: "100%", height: "100%", format: "rgba16f" }
  },
  globals: {
    density: {
      type: "float",
      default: 5,
      uniform: "density",
      min: 1,
      max: 100,
      step: 1,
      ui: {
        label: "Density",
        control: "slider"
      }
    },
    stride: {
      type: "float",
      default: 1,
      uniform: "stride",
      min: 0.1,
      max: 10,
      step: 0.1,
      ui: {
        label: "Stride",
        control: "slider"
      }
    },
    quantize: {
      type: "boolean",
      default: false,
      uniform: "quantize",
      ui: {
        label: "Quantize",
        control: "checkbox"
      }
    },
    intensity: {
      type: "float",
      default: 90,
      uniform: "intensity",
      min: 0,
      max: 100,
      step: 1,
      ui: {
        label: "Trail Persistence",
        control: "slider"
      }
    },
    inverse: {
      type: "boolean",
      default: false,
      uniform: "inverse",
      ui: {
        label: "Inverse",
        control: "checkbox"
      }
    },
    xyBlend: {
      type: "boolean",
      default: false,
      uniform: "xyBlend",
      ui: {
        label: "XY Blend",
        control: "checkbox"
      }
    },
    wormLifetime: {
      type: "float",
      default: 30,
      uniform: "wormLifetime",
      min: 0,
      max: 60,
      step: 1,
      ui: {
        label: "Lifetime",
        control: "slider"
      }
    },
    inputIntensity: {
      type: "float",
      default: 50,
      uniform: "inputIntensity",
      min: 0,
      max: 100,
      step: 1,
      ui: {
        label: "Input Intensity",
        control: "slider"
      }
    }
  },
  passes: [
    // Pass 0: Copy previous trail with decay to preserve accumulation
    // globalHflowTrail ping-pong: read previous, write current with fade
    {
      name: "initFromPrev",
      program: "initFromPrev",
      inputs: {
        prevTrailTex: "globalHflowTrail"
      },
      outputs: {
        fragColor: "globalHflowTrail"
      }
    },
    // Pass 1: Update agent state (position, direction, color, age)
    // MRT outputs to 3 state textures simultaneously
    {
      name: "agent",
      program: "agent",
      drawBuffers: 3,
      inputs: {
        stateTex1: "globalHflowState1",
        stateTex2: "globalHflowState2",
        stateTex3: "globalHflowState3",
        mixerTex: "inputTex"
      },
      outputs: {
        outState1: "globalHflowState1",
        outState2: "globalHflowState2",
        outState3: "globalHflowState3"
      }
    },
    // Pass 2: Deposit agent trails as point sprites (additive onto faded trail)
    {
      name: "deposit",
      program: "deposit",
      drawMode: "points",
      count: 65536,  // 256x256 agents
      blend: ["one", "one"],  // Additive blending onto faded trail
      inputs: {
        stateTex1: "globalHflowState1",
        stateTex2: "globalHflowState2",
        density: "density"
      },
      outputs: {
        fragColor: "globalHflowTrail"
      }
    },
    // Pass 3: Final composite with input
    {
      name: "blend",
      program: "blend",
      inputs: {
        inputTex: "inputTex",
        trailTex: "globalHflowTrail"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
