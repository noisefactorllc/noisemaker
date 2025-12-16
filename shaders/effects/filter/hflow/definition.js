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
  namespace: "filter",
  func: "hflow",
  tags: ["math", "sim"],

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
      min: 0,
      max: 100,
      step: 1,
      ui: {
        label: "density",
        control: "slider",
        category: "agents"
      }
    },
    attrition: {
      type: "float",
      default: 1,
      uniform: "attrition",
      min: 0,
      max: 10,
      step: 0.1,
      ui: {
        label: "attrition",
        control: "slider",
        category: "agents"
      }
    },
    stride: {
      type: "float",
      default: 10,
      uniform: "stride",
      min: 1,
      max: 1000,
      step: 1,
      ui: {
        label: "stride",
        control: "slider",
        category: "agents"
      }
    },
    quantize: {
      type: "boolean",
      default: false,
      uniform: "quantize",
      ui: {
        label: "quantize",
        control: "checkbox",
        category: "agents"
      }
    },
    inverse: {
      type: "boolean",
      default: false,
      uniform: "inverse",
      ui: {
        label: "inverse",
        control: "checkbox",
        category: "agents"
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
        label: "intensity",
        control: "slider",
        category: "blending"
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
        label: "input intensity",
        control: "slider",
        category: "blending"
      }
    },
    inputWeight: {
      type: "float",
      default: 100,
      uniform: "inputWeight",
      min: 0,
      max: 100,
      step: 1,
      ui: {
        label: "input weight",
        control: "slider",
        category: "blending"
      }
    },
    resetState: {
      type: "boolean",
      default: false,
      uniform: "resetState",
      ui: {
        control: "button",
        buttonLabel: "reset",
        label: "state"
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
      uniforms: {
        intensity: "intensity"
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
        inputTex: "inputTex"
      },
      uniforms: {
        stride: "stride",
        quantize: "quantize",
        inverse: "inverse",
        attrition: "attrition",
        inputWeight: "inputWeight"
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
      uniforms: {
        inputIntensity: "inputIntensity"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
