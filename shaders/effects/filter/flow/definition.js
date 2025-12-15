import { Effect } from '../../../src/runtime/effect.js'

/**
 * Flow - Agent-based flow field effect with temporal accumulation
 *
 * Architecture (GPGPU via render passes):
 * - Uses fragment shaders with MRT for agent simulation
 * - Global surfaces for agent state (position/dir, color, age) with ping-pong
 * - Trail accumulation via point-sprite deposit pass
 * - Multi-pass: agent -> deposit -> diffuse -> blend
 *
 * Agent format: [x, y, rot, stride] [r, g, b, seed] [age, behavior, 0, 0]
 * Stored across 3 state textures using MRT
 */
export default new Effect({
  name: "Flow",
  namespace: "filter",
  func: "flow",
  tags: ["math", "sim"],

  description: "Agent-based flow field with behaviors",
  textures: {
    globalFlowState1: { width: 512, height: 512, format: "rgba16f" },
    globalFlowState2: { width: 512, height: 512, format: "rgba16f" },
    globalFlowState3: { width: 512, height: 512, format: "rgba16f" },
    globalFlowTrail: { width: "100%", height: "100%", format: "rgba16f" }
  },
  globals: {
    behavior: {
      type: "int",
      default: 1,
      uniform: "behavior",
      choices: {
        none: 0,
        obedient: 1,
        crosshatch: 2,
        unruly: 3,
        chaotic: 4,
        randomMix: 5,
        meandering: 10
      },
      ui: {
        label: "Behavior",
        control: "dropdown"
      }
    },
    density: {
      type: "float",
      default: 20,
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
    strideDeviation: {
      type: "float",
      default: 0.05,
      uniform: "strideDeviation",
      min: 0,
      max: 0.5,
      step: 0.01,
      ui: {
        label: "Stride Deviation",
        control: "slider"
      }
    },
    kink: {
      type: "float",
      default: 1,
      uniform: "kink",
      min: 0,
      max: 10,
      step: 0.1,
      ui: {
        label: "Kink",
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
    },
    lifetime: {
      type: "float",
      default: 30,
      uniform: "lifetime",
      min: 0,
      max: 60,
      step: 1,
      ui: {
        label: "Lifetime",
        control: "slider"
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
    // globalFlowTrail ping-pong: read previous, write current with fade
    {
      name: "diffuse",
      program: "diffuse",
      inputs: {
        sourceTex: "globalFlowTrail"
      },
      uniforms: {
        intensity: "intensity"
      },
      outputs: {
        fragColor: "globalFlowTrail"
      }
    },
    // Pass 1: Update agent state (position, direction, color, age)
    // MRT outputs to 3 state textures simultaneously
    {
      name: "agent",
      program: "agent",
      drawBuffers: 3,
      inputs: {
        stateTex1: "globalFlowState1",
        stateTex2: "globalFlowState2",
        stateTex3: "globalFlowState3",
        inputTex: "inputTex"
      },
      uniforms: {
        behavior: "behavior",
        density: "density",
        stride: "stride",
        strideDeviation: "strideDeviation",
        kink: "kink",
        quantize: "quantize",
        lifetime: "lifetime"
      },
      outputs: {
        outState1: "globalFlowState1",
        outState2: "globalFlowState2",
        outState3: "globalFlowState3"
      }
    },
    // Pass 2: Deposit agent trails as point sprites (additive onto faded trail)
    {
      name: "deposit",
      program: "deposit",
      drawMode: "points",
      count: 262144,  // 512x512 agents
      blend: true,
      inputs: {
        stateTex1: "globalFlowState1",
        stateTex2: "globalFlowState2"
      },
      outputs: {
        fragColor: "globalFlowTrail"
      }
    },
    // Pass 3: Final composite with input
    {
      name: "blend",
      program: "blend",
      inputs: {
        inputTex: "inputTex",
        trailTex: "globalFlowTrail"
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
