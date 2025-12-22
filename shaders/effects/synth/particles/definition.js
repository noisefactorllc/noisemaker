import { Effect } from '../../../src/runtime/effect.js'

/**
 * Particles - Physics-based particle simulation with gravity and wind
 *
 * Simple architecture mirroring flow:
 * - diffuse: Trail decay/persistence
 * - agent: Update particle position/velocity with physics
 * - deposit: Point-sprite particle trails
 * - blend: Final composite with input
 *
 * Particle state: [x, y, vx, vy] [r, g, b, seed] [age, energy, 0, 0]
 */
export default new Effect({
  name: "Particles",
  namespace: "synth",
  func: "particles",
  tags: ["sim"],

  description: "Physics-based particle simulation",
  textures: {
    globalParticlesState1: { width: 256, height: 256, format: "rgba16f" },
    globalParticlesState2: { width: 256, height: 256, format: "rgba16f" },
    globalParticlesState3: { width: 256, height: 256, format: "rgba16f" },
    globalParticlesTrail: { width: "100%", height: "100%", format: "rgba16f" }
  },
  globals: {
    tex: {
      type: "surface",
      default: "none",
      colorModeUniform: "colorMode",
      ui: { label: "texture" }
    },
    density: {
      type: "float",
      default: 25,
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
    gravity: {
      type: "float",
      default: 0.25,
      uniform: "gravity",
      min: -2,
      max: 2,
      step: 0.01,
      ui: {
        label: "gravity",
        control: "slider",
        category: "physics"
      }
    },
    wind: {
      type: "float",
      default: 0,
      uniform: "wind",
      min: -2,
      max: 2,
      step: 0.01,
      ui: {
        label: "wind",
        control: "slider",
        category: "physics"
      }
    },
    energy: {
      type: "float",
      default: 1,
      uniform: "energy",
      min: 0,
      max: 2,
      step: 0.01,
      ui: {
        label: "energy",
        control: "slider",
        category: "physics"
      }
    },
    drag: {
      type: "float",
      default: 0.125,
      uniform: "drag",
      min: 0,
      max: 0.2,
      step: 0.005,
      ui: {
        label: "drag",
        control: "slider",
        category: "physics"
      }
    },
    stride: {
      type: "float",
      default: 0.5,
      uniform: "stride",
      min: 0,
      max: 1,
      step: 0.01,
      ui: {
        label: "stride variation",
        control: "slider",
        category: "physics"
      }
    },
    wander: {
      type: "float",
      default: 0.25,
      uniform: "wander",
      min: 0,
      max: 1,
      step: 0.01,
      ui: {
        label: "wander",
        control: "slider",
        category: "physics"
      }
    },
    attrition: {
      type: "float",
      default: 0.6,
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
    intensity: {
      type: "float",
      default: 3,
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
    // Pass 0: Trail decay
    {
      name: "diffuse",
      program: "diffuse",
      inputs: {
        sourceTex: "globalParticlesTrail"
      },
      uniforms: {
        intensity: "intensity"
      },
      outputs: {
        fragColor: "globalParticlesTrail"
      }
    },
    // Pass 1: Update particle state with physics
    {
      name: "agent",
      program: "agent",
      drawBuffers: 3,
      inputs: {
        stateTex1: "globalParticlesState1",
        stateTex2: "globalParticlesState2",
        stateTex3: "globalParticlesState3",
        inputTex: "tex"
      },
      uniforms: {
        density: "density",
        gravity: "gravity",
        wind: "wind",
        energy: "energy",
        attrition: "attrition"
      },
      outputs: {
        outState1: "globalParticlesState1",
        outState2: "globalParticlesState2",
        outState3: "globalParticlesState3"
      }
    },
    // Pass 2: Deposit particle trails
    {
      name: "deposit",
      program: "deposit",
      drawMode: "points",
      count: 65536,  // 256x256 particles
      blend: true,
      inputs: {
        stateTex1: "globalParticlesState1",
        stateTex2: "globalParticlesState2"
      },
      outputs: {
        fragColor: "globalParticlesTrail"
      }
    },
    // Pass 3: Final composite
    {
      name: "blend",
      program: "blend",
      inputs: {
        inputTex: "tex",
        trailTex: "globalParticlesTrail"
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
