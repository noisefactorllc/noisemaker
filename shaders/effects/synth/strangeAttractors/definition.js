import { Effect } from '../../../src/runtime/effect.js'

/**
 * Strange Attractors - Chaotic dynamical systems visualization
 *
 * Implements several well-known strange attractors:
 * - 0: Lorenz (butterfly)
 * - 1: Rössler (spiral)
 * - 2: Aizawa (torus-like)
 * - 3: Thomas (cyclically symmetric)
 * - 4: Halvorsen (3-fold symmetric)
 * - 5: Chen (double scroll)
 * - 6: Dadras (4-wing)
 *
 * Architecture (mirroring particles):
 * - diffuse: Trail decay/persistence
 * - agent: Update point positions via attractor equations
 * - deposit: Point-sprite trails
 * - blend: Final composite
 */
export default new Effect({
  name: "Strange Attractors",
  namespace: "synth",
  func: "strangeAttractors",
  tags: ["sim"],

  description: "Chaotic dynamical systems visualization",
  textures: {
    global_attractor_state1: { width: 256, height: 256, format: "rgba32f" },
    global_attractor_state2: { width: 256, height: 256, format: "rgba16f" },
    global_attractor_trail: { width: "100%", height: "100%", format: "rgba16f" }
  },
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
    attractor: {
      type: "int",
      default: 0,
      uniform: "attractor",
      choices: {
        lorenz: 0,
        rossler: 1,
        aizawa: 2,
        thomas: 3,
        halvorsen: 4,
        chen: 5,
        dadras: 6
      },
      ui: {
        label: "attractor",
        control: "dropdown",
        category: "attractor"
      }
    },
    density: {
      type: "float",
      default: 50,
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
    speed: {
      type: "float",
      default: 1.0,
      uniform: "speed",
      min: 0.01,
      max: 2,
      step: 0.01,
      ui: {
        label: "speed",
        control: "slider",
        category: "dynamics"
      }
    },
    scale: {
      type: "float",
      default: 0.8,
      uniform: "scale",
      min: 0.1,
      max: 10,
      step: 0.01,
      ui: {
        label: "scale",
        control: "slider",
        category: "dynamics"
      }
    },
    rotateX: {
      type: "float",
      default: 0.3,
      uniform: "rotateX",
      min: 0,
      max: 6.283185,
      step: 0.01,
      ui: {
        label: "rotate X",
        control: "slider",
        category: "view"
      }
    },
    rotateY: {
      type: "float",
      default: 0,
      uniform: "rotateY",
      min: 0,
      max: 6.283185,
      step: 0.01,
      ui: {
        label: "rotate Y",
        control: "slider",
        category: "view"
      }
    },
    rotateZ: {
      type: "float",
      default: 0,
      uniform: "rotateZ",
      min: 0,
      max: 6.283185,
      step: 0.01,
      ui: {
        label: "rotate Z",
        control: "slider",
        category: "view"
      }
    },
    intensity: {
      type: "float",
      default: 95,
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
        sourceTex: "global_attractor_trail"
      },
      uniforms: {
        intensity: "intensity"
      },
      outputs: {
        fragColor: "global_attractor_trail"
      }
    },
    // Pass 1: Update attractor state
    {
      name: "agent",
      program: "agent",
      drawBuffers: 2,
      inputs: {
        stateTex1: "global_attractor_state1",
        stateTex2: "global_attractor_state2",
        tex: "tex"
      },
      uniforms: {
        attractor: "attractor",
        density: "density",
        speed: "speed",
        scale: "scale",
        colorMode: "colorMode"
      },
      outputs: {
        outState1: "global_attractor_state1",
        outState2: "global_attractor_state2"
      }
    },
    // Pass 2: Deposit trails
    {
      name: "deposit",
      program: "deposit",
      drawMode: "points",
      count: 65536,
      blend: true,
      inputs: {
        stateTex1: "global_attractor_state1",
        stateTex2: "global_attractor_state2"
      },
      uniforms: {
        rotateX: "rotateX",
        rotateY: "rotateY",
        rotateZ: "rotateZ",
        scale: "scale",
        density: "density"
      },
      outputs: {
        fragColor: "global_attractor_trail"
      }
    },
    // Pass 3: Final composite
    {
      name: "blend",
      program: "blend",
      inputs: {
        tex: "tex",
        trailTex: "global_attractor_trail"
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
