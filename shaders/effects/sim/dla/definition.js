import { Effect } from '../../../src/runtime/effect.js'

/**
 * DLA (Diffusion-Limited Aggregation)
 * Mono-only version derived from nm/dla
 */
export default new Effect({
  name: "Dla",
  namespace: "sim",
  func: "dla",
  tags: ["math"],

  description: "Diffusion-limited aggregation",
  globals: {
    padding: {
        type: "float",
        default: 2,
        uniform: "padding",
        min: 1,
        max: 8,
        step: 0.5,
        ui: {
            label: "Padding",
            control: "slider"
        }
    },
    seedDensity: {
        type: "float",
        default: 0.005,
        uniform: "seedDensity",
        min: 0.001,
        max: 0.1,
        step: 0.001,
        ui: {
            label: "Seed Density",
            control: "slider"
        }
    },
    density: {
        type: "float",
        default: 0.2,
        uniform: "density",
        min: 0.01,
        max: 0.8,
        step: 0.01,
        ui: {
            label: "Walker Density",
            control: "slider"
        }
    },
    speed: {
        type: "float",
        default: 1,
        uniform: "speed",
        min: 0.1,
        max: 4,
        step: 0.1,
        ui: {
            label: "Speed",
            control: "slider"
        }
    },
    alpha: {
        type: "float",
        default: 0.75,
        uniform: "alpha",
        min: 0,
        max: 1,
        step: 0.05,
        ui: {
            label: "Alpha",
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
  textures: {
    globalGridState: { width: "100%", height: "100%", format: "rgba16f" },
    globalAgentState: { width: 256, height: 256, format: "rgba16f" }
  },
  passes: [
    {
      name: "decayGrid",
      program: "initFromPrev",
      inputs: {
        gridTex: "globalGridState"
      },
      uniforms: {
        padding: "padding",
        seedDensity: "seedDensity",
        density: "density",
        frame: "frame",
        alpha: "alpha"
      },
      outputs: {
        dlaOutColor: "globalGridState"
      }
    },
    {
      name: "simulateAgents",
      program: "agentWalk",
      inputs: {
        agentTex: "globalAgentState",
        gridTex: "globalGridState"
      },
      uniforms: {
        padding: "padding",
        speed: "speed",
        frame: "frame",
        density: "density",
        seedDensity: "seedDensity"
      },
      outputs: {
        dlaOutColor: "globalAgentState"
      }
    },
    {
      name: "depositAgents",
      program: "saveCluster",
      drawMode: "points",
      count: 65536,  // 256x256 agents
      blend: ["one", "one"],
      inputs: {
        agentTex: "globalAgentState"
      },
      uniforms: {
        alpha: "alpha"
      },
      outputs: {
        dlaOutColor: "globalGridState"
      }
    },
    {
      name: "finalBlend",
      program: "finalBlend",
      inputs: {
        gridTex: "globalGridState",
        inputTex: "inputTex"
      },
      uniforms: {
        alpha: "alpha"
      },
      outputs: {
        dlaOutColor: "outputTex"
      }
    }
  ]
})
