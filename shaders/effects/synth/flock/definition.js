import { Effect } from '../../../src/runtime/effect.js'

/**
 * Flock - 2D Boids flocking simulation
 *
 * Architecture (GPGPU via render passes):
 * - Uses fragment shaders with MRT for boid simulation
 * - Global surfaces for boid state (position/velocity, color) with ping-pong
 * - Trail accumulation via point-sprite deposit pass
 * - Multi-pass: agent -> deposit -> diffuse -> render
 *
 * Boid state format:
 * - State1: [posX, posY, velX, velY] - position and velocity
 * - State2: [r, g, b, age] - color and age for respawn
 *
 * Implements classic boids rules:
 * - Separation: avoid crowding neighbors
 * - Alignment: steer toward average heading of neighbors
 * - Cohesion: steer toward average position of neighbors
 *
 * Plus optional extensions:
 * - Boundary modes: wrap or soft wall
 * - Noise/turbulence for organic motion
 */
export default new Effect({
  name: "Flock",
  namespace: "synth",
  func: "flock",
  tags: ["sim"],

  description: "2D Boids flocking simulation",
  textures: {
    globalFlockState1: { width: 256, height: 256, format: "rgba32f" },
    globalFlockState2: { width: 256, height: 256, format: "rgba16f" },
    globalFlockTrail: { width: "100%", height: "100%", format: "rgba16f" }
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
    // Classic boids parameters
    separation: {
      type: "float",
      default: 2.0,
      uniform: "separation",
      min: 0,
      max: 5,
      step: 0.1,
      ui: {
        label: "separation",
        control: "slider",
        category: "boids"
      }
    },
    alignment: {
      type: "float",
      default: 1.0,
      uniform: "alignment",
      min: 0,
      max: 5,
      step: 0.1,
      ui: {
        label: "alignment",
        control: "slider",
        category: "boids"
      }
    },
    cohesion: {
      type: "float",
      default: 1.0,
      uniform: "cohesion",
      min: 0,
      max: 5,
      step: 0.1,
      ui: {
        label: "cohesion",
        control: "slider",
        category: "boids"
      }
    },
    perceptionRadius: {
      type: "float",
      default: 50,
      uniform: "perceptionRadius",
      min: 10,
      max: 200,
      step: 1,
      ui: {
        label: "perception",
        control: "slider",
        category: "boids"
      }
    },
    separationRadius: {
      type: "float",
      default: 25,
      uniform: "separationRadius",
      min: 5,
      max: 100,
      step: 1,
      ui: {
        label: "separation radius",
        control: "slider",
        category: "boids"
      }
    },
    maxSpeed: {
      type: "float",
      default: 4.0,
      uniform: "maxSpeed",
      min: 0.5,
      max: 10,
      step: 0.1,
      ui: {
        label: "max speed",
        control: "slider",
        category: "motion"
      }
    },
    maxForce: {
      type: "float",
      default: 0.3,
      uniform: "maxForce",
      min: 0.01,
      max: 1.0,
      step: 0.01,
      ui: {
        label: "max force",
        control: "slider",
        category: "motion"
      }
    },
    // Boundary behavior
    boundaryMode: {
      type: "int",
      default: 0,
      uniform: "boundaryMode",
      choices: {
        wrap: 0,
        softWall: 1
      },
      ui: {
        label: "boundary",
        control: "dropdown",
        category: "motion"
      }
    },
    wallMargin: {
      type: "float",
      default: 50,
      uniform: "wallMargin",
      min: 10,
      max: 200,
      step: 1,
      ui: {
        label: "wall margin",
        control: "slider",
        category: "motion"
      }
    },
    // Noise/turbulence
    noiseWeight: {
      type: "float",
      default: 0.1,
      uniform: "noiseWeight",
      min: 0,
      max: 1,
      step: 0.01,
      ui: {
        label: "noise",
        control: "slider",
        category: "motion"
      }
    },
    // Agent density and respawn
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
    attrition: {
      type: "float",
      default: 0.5,
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
    // Blending parameters (kept from flow for app consistency)
    intensity: {
      type: "float",
      default: 90,
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
      default: 0,
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
    // Pass 0: Diffuse/decay trail
    {
      name: "diffuse",
      program: "diffuse",
      inputs: {
        sourceTex: "globalFlockTrail"
      },
      uniforms: {
        intensity: "intensity"
      },
      outputs: {
        fragColor: "globalFlockTrail"
      }
    },
    // Pass 1: Update boid state (position, velocity, color)
    {
      name: "agent",
      program: "agent",
      drawBuffers: 2,
      inputs: {
        stateTex1: "globalFlockState1",
        stateTex2: "globalFlockState2",
        tex: "tex"
      },
      uniforms: {
        separation: "separation",
        alignment: "alignment",
        cohesion: "cohesion",
        perceptionRadius: "perceptionRadius",
        separationRadius: "separationRadius",
        maxSpeed: "maxSpeed",
        maxForce: "maxForce",
        boundaryMode: "boundaryMode",
        wallMargin: "wallMargin",
        noiseWeight: "noiseWeight",
        attrition: "attrition",
        colorMode: "colorMode"
      },
      outputs: {
        outState1: "globalFlockState1",
        outState2: "globalFlockState2"
      }
    },
    // Pass 2: Deposit boid trails as point sprites
    {
      name: "deposit",
      program: "deposit",
      drawMode: "points",
      count: 65536,  // 256x256 boids
      blend: true,
      inputs: {
        stateTex1: "globalFlockState1",
        stateTex2: "globalFlockState2"
      },
      uniforms: {
        density: "density"
      },
      outputs: {
        fragColor: "globalFlockTrail"
      }
    },
    // Pass 3: Final render composite
    {
      name: "render",
      program: "render",
      inputs: {
        trailTex: "globalFlockTrail",
        tex: "tex"
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
