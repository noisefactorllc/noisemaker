import { Effect } from '../../../src/runtime/effect.js'

/**
 * Strange Attractors - Chaotic dynamical systems visualization
 *
 * Common Agent Architecture middleware:
 * - Reads agent state from pipeline inputs (global_xyz, global_vel, global_rgba)
 * - Computes attractor dynamics (Lorenz, Rössler, Aizawa, etc.)
 * - Writes updated positions to same textures (ping-ponged by runtime)
 *
 * State format (matching pointsEmit):
 * - xyz: [x, y, z, alive_flag]  (3D position in attractor space, w=1 alive)
 * - vel: [vx, vy, vz, seed]     (velocity for momentum effects)
 * - rgba: [r, g, b, a]          (agent color)
 *
 * Available attractors:
 * - 0: Lorenz (butterfly)
 * - 1: Rössler (spiral)
 * - 2: Aizawa (torus-like)
 * - 3: Thomas (cyclically symmetric)
 * - 4: Halvorsen (3-fold symmetric)
 * - 5: Chen (double scroll)
 * - 6: Dadras (4-wing)
 *
 * Usage: pointsEmit().attractor().pointsRender(viewMode: 1).write(o0)
 */
export default new Effect({
  name: "Attractor",
  namespace: "points",
  func: "attractor",
  tags: ["sim", "agents"],

  description: "Strange attractors: chaotic dynamic systems visualization",

  // No local textures - we use shared global_xyz/vel/rgba textures
  textures: {},

  // Expose outputs to pipeline for downstream effects
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
      }
    },

    // Override viewMode default to 3D for strange attractors
    // This propagates to pointsRender downstream
    viewMode: {
      type: "int",
      default: 1,
      uniform: "viewMode",
      ui: { control: false }  // Controlled by pointsRender UI
    }
  },

  passes: [
    // Pass 1: Update attractor state
    // Read from shared global textures (previous frame or pointsEmit output)
    // Write back to same textures (ping-pong handled by runtime)
    {
      name: "agent",
      program: "agent",
      drawBuffers: 3,
      inputs: {
        // Read from shared global textures
        xyzTex: "global_xyz",
        velTex: "global_vel",
        rgbaTex: "global_rgba"
      },
      uniforms: {
        attractor: "attractor",
        speed: "speed"
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
