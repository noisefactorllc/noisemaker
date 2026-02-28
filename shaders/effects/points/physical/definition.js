import { Effect } from '../../../src/runtime/effect.js'

/**
 * Particles - Physics-based particle simulation with gravity and wind
 *
 * Common Agent Architecture middleware:
 * - Reads agent state from pipeline inputs (inputXyz, inputVel, inputRgba)
 * - Applies physics (gravity, wind, drag, wander)
 * - Writes updated state to own textures (ping-ponged by runtime)
 *
 * State format (matching pointsEmit):
 * - xyz: [x, y, z, alive_flag]  (z used for depth, w=1 alive, w=0 dead)
 * - vel: [vx, vy, vz, seed]     (z velocity, w for per-agent seed)
 * - rgba: [r, g, b, a]          (agent color)
 *
 * Usage: pointsEmit().physical().pointsRender().write(o0)
 */
export default new Effect({
  name: "Physical",
  namespace: "points",
  func: "physical",
  tags: ["sim"],

  description: "Physics-based particle simulation with wind and gravity forces",

  // No local textures - we use shared global_xyz/vel/rgba textures
  // These are created by pointsEmit and shared across the particle pipeline
  textures: {},

  // Expose outputs to pipeline for downstream effects
  // Using underscore convention for SHARED global textures (not node-prefixed)
  outputXyz: "global_xyz",
  outputVel: "global_vel",
  outputRgba: "global_rgba",

  globals: {
    // stateSize parameter for texture sizing (must match pointsEmit)
    stateSize: {
      type: "int",
      default: 256,
      uniform: "stateSize",
      ui: { control: false }  // Inherited from pointsEmit
    },
    gravity: {
      type: "float",
      default: 0.05,
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
      default: 0.5,
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
      default: 0.15,
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
    deviation: {
      type: "float",
      default: 0.75,
      uniform: "deviation",
      min: 0,
      max: 1,
      step: 0.01,
      ui: {
        label: "deviation",
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
    }
  },

  passes: [
    // Pass 1: Update particle physics
    // Read from shared global textures (previous frame or pointsEmit output)
    // Write back to same textures (ping-pong handled by runtime)
    {
      name: "agent",
      program: "agent",
      drawBuffers: 3,
      inputs: {
        // Read from shared global textures
        // Within-frame: updateFrameSurfaceBindings makes pointsEmit's writes visible
        xyzTex: "global_xyz",
        velTex: "global_vel",
        rgbaTex: "global_rgba"
      },
      uniforms: {
        gravity: "gravity",
        wind: "wind",
        energy: "energy",
        drag: "drag",
        deviation: "deviation",
        wander: "wander"
      },
      outputs: {
        // Write to shared global textures (ping-pong for next frame)
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
