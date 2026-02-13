import { Effect } from '../../../src/runtime/effect.js'

/**
 * Flock - 2D Boids flocking simulation
 *
 * Common Agent Architecture middleware:
 * - Reads agent state from pipeline inputs (global_xyz, global_vel, global_rgba)
 * - Applies boids flocking rules (separation, alignment, cohesion)
 * - Writes updated state back to global textures
 *
 * State format (matching pointsEmit):
 * - xyz: [x, y, z, alive_flag]  (x,y in normalized coords [0,1], w=1 alive)
 * - vel: [vx, vy, age, seed]    (velocity and per-agent data)
 * - rgba: [r, g, b, a]          (agent color)
 *
 * Usage: pointsEmit().flock().pointsRender().write(o0)
 */
export default new Effect({
  name: "Flock",
  namespace: "points",
  func: "flock",
  tags: ["sim"],

  description: "2D \"Boids\" flocking agent simulation",

  // No local textures - use shared global_xyz/vel/rgba from pointsEmit
  textures: {},

  // Expose outputs to pipeline for downstream effects
  outputXyz: "global_xyz",
  outputVel: "global_vel",
  outputRgba: "global_rgba",

  globals: {
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
        label: "sep radius",
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
    }
  },

  passes: [
    // Pass 1: Update boid state (position, velocity, color)
    {
      name: "agent",
      program: "agent",
      drawBuffers: 3,
      inputs: {
        xyzTex: "global_xyz",
        velTex: "global_vel",
        rgbaTex: "global_rgba"
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
        noiseWeight: "noiseWeight"
      },
      outputs: {
        outXYZ: "global_xyz",
        outVel: "global_vel",
        outRGBA: "global_rgba"
      }
    },

    // Pass 2: Copy input texture to output for 2D chain continuity
    {
      name: "passthrough",
      program: "passthrough",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
