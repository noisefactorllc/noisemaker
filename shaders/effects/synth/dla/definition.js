import { Effect } from '../../../src/runtime/effect.js'

/**
 * DLA (Diffusion-Limited Aggregation)
 * Mono-only version derived from nm/dla
 */
export default new Effect({
  name: "Dla",
  func: "dla",
  tags: ["sim"],

  description: "Diffusion-limited aggregation",
  globals: {
    tex: {
      type: "surface",
      default: "none",
      colorModeUniform: "colorMode",
      ui: { label: "texture" }
    },
    colorMode: {
      type: "int",
      default: 1,
      uniform: "colorMode",
      ui: { control: false }
    },
    intensity: {
        type: "float",
        default: 98,
        uniform: "intensity",
        min: 0,
        max: 100,
        step: 1,
        ui: {
            label: "trail intensity",
            control: "slider",
            category: "blending"
        }
    },
    inputIntensity: {
        type: "float",
        default: 0,
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
        default: 15,
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
    decay: {
        type: "float",
        default: 0.25,
        uniform: "decay",
        min: 0,
        max: 0.5,
        step: 0.01,
        ui: {
            label: "decay",
            control: "slider",
            category: "chemistry"
        }
    },
    deposit: {
        type: "float",
        default: 17.5,
        uniform: "deposit",
        min: 0.5,
        max: 20.0,
        step: 0.5,
        ui: {
            label: "deposit",
            control: "slider",
            category: "chemistry"
        }
    },
    density: {
        type: "float",
        default: 75,
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
        default: 7.5,
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
        default: 15,
        uniform: "stride",
        min: 1,
        max: 50,
        step: 1,
        ui: {
            label: "stride",
            control: "slider",
            category: "agents"
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
  textures: {
    globalGridState: { width: "100%", height: "100%", format: "rgba16f" },
    globalAgentState: { width: 256, height: 256, format: "rgba16f" },
    globalAgentColor: { width: 256, height: 256, format: "rgba16f" },
    globalVisualTrail: { width: "100%", height: "100%", format: "rgba16f" },
    tempGrid: { width: "100%", height: "100%", format: "rgba16f" }
  },
  passes: [
    // Decay simulation grid (what agents sense)
    {
      name: "decayGrid",
      program: "initFromPrev",
      inputs: {
        gridTex: "globalGridState"
      },
      uniforms: {
        decay: "decay",
        frame: "frame",
        resetState: "resetState"
      },
      outputs: {
        dlaOutColor: "tempGrid"
      }
    },
    // Decay visual trail (what user sees) - intensity controls persistence
    {
      name: "diffuseTrail",
      program: "diffuse",
      inputs: {
        sourceTex: "globalVisualTrail"
      },
      uniforms: {
        intensity: "intensity",
        resetState: "resetState"
      },
      outputs: {
        fragColor: "globalVisualTrail"
      }
    },
    // Agents walk using simulation grid
    {
      name: "simulateAgents",
      program: "agentWalk",
      drawBuffers: 2,
      inputs: {
        agentTex: "globalAgentState",
        colorTex: "globalAgentColor",
        gridTex: "globalGridState",
        tex: "tex"
      },
      uniforms: {
        inputWeight: "inputWeight",
        attrition: "attrition",
        stride: "stride",
        density: "density",
        frame: "frame",
        resetState: "resetState",
        colorMode: "colorMode"
      },
      outputs: {
        outState: "globalAgentState",
        outColor: "globalAgentColor"
      }
    },
    // Deposit agents to simulation grid
    {
      name: "depositAgentsToSim",
      program: "saveCluster",
      drawMode: "points",
      count: 65536,
      blend: ["one", "one"],
      inputs: {
        agentTex: "globalAgentState",
        colorTex: "globalAgentColor"
      },
      uniforms: {
        deposit: "deposit",
        resetState: "resetState"
      },
      outputs: {
        dlaOutColor: "tempGrid"
      }
    },
    // Deposit agents to visual trail
    {
      name: "depositAgentsToVisual",
      program: "saveCluster",
      drawMode: "points",
      count: 65536,
      blend: ["one", "one"],
      inputs: {
        agentTex: "globalAgentState",
        colorTex: "globalAgentColor"
      },
      uniforms: {
        deposit: "deposit",
        resetState: "resetState"
      },
      outputs: {
        dlaOutColor: "globalVisualTrail"
      }
    },
    // Save simulation grid state
    {
      name: "saveState",
      program: "clampedCopy",
      inputs: {
        tex: "tempGrid"
      },
      outputs: {
        outColor: "globalGridState"
      }
    },
    // Final blend - visual trail with input
    {
      name: "finalBlend",
      program: "finalBlend",
      inputs: {
        gridTex: "globalVisualTrail",
        tex: "tex"
      },
      uniforms: {
        inputIntensity: "inputIntensity"
      },
      outputs: {
        dlaOutColor: "outputTex"
      }
    }
  ]
})
