import { Effect } from '../../../src/runtime/effect.js'

/**
 * Physarum - Slime mold agent simulation
 *
 * Common Agent Architecture middleware:
 * - Reads agent state from pipeline inputs (global_xyz, global_vel, global_rgba)
 * - Applies physarum sensor/steering behavior based on trail texture
 * - Writes updated state back to global textures
 *
 * State format (matching pointsEmit):
 * - xyz: [x, y, heading, alive_flag]  (x,y in normalized [0,1], heading in radians)
 * - vel: [0, 0, age, seed]             (age for effects, seed for randomness)
 * - rgba: [r, g, b, a]                 (agent color from pointsEmit)
 *
 * Usage: pointsEmit().physarum().pointsRender().write(o0)
 */
export default new Effect({
  name: "Physarum",
  namespace: "points",
  func: "physarum",
  tags: ["sim"],

  description: "Physarum slime mold simulation",

  // Private pheromone texture - NOT shared with pointsRender
  // This isolates chemistry (deposit/decay) from visual trail intensity
  textures: {
    global_physarum_pheromone: {
      width: "100%",
      height: "100%",
      format: "rgba16f"
    }
  },

  // Expose outputs to pipeline for downstream effects
  outputXyz: "global_xyz",
  outputVel: "global_vel",
  outputRgba: "global_rgba",

  globals: {
    moveSpeed: {
      type: "float",
      default: 1.78,
      uniform: "moveSpeed",
      min: 0.05,
      max: 3,
      step: 0.01,
      ui: {
        label: "move speed",
        control: "slider",
        category: "agents"
      }
    },
    turnSpeed: {
      type: "float",
      default: 1,
      uniform: "turnSpeed",
      min: 0,
      max: 3.14159,
      step: 0.01,
      ui: {
        label: "turn speed",
        control: "slider",
        category: "agents"
      }
    },
    sensorAngle: {
      type: "float",
      default: 1.26,
      uniform: "sensorAngle",
      min: 0.1,
      max: 1.5,
      step: 0.01,
      ui: {
        label: "sensor angle",
        control: "slider",
        category: "agents"
      }
    },
    sensorDistance: {
      type: "float",
      default: 0.03,
      uniform: "sensorDistance",
      min: 0.002,
      max: 0.1,
      step: 0.001,
      ui: {
        label: "sensor dist",
        control: "slider",
        category: "agents"
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
        category: "agents"
      }
    },
    deposit: {
      type: "float",
      default: 0.5,
      uniform: "deposit",
      min: 0.0,
      max: 1.0,
      step: 0.01,
      ui: {
        label: "deposit",
        control: "slider",
        category: "chemistry"
      }
    },
    decay: {
      type: "float",
      default: 0.1,
      uniform: "decay",
      min: 0.0,
      max: 1.0,
      step: 0.01,
      ui: {
        label: "decay",
        control: "slider",
        category: "chemistry"
      }
    },
    resetState: {
      type: "boolean",
      default: false,
      uniform: "resetState",
      ui: {
        control: "button",
        buttonLabel: "reset",
        label: "reset"
      }
    }
  },

  passes: [
    // Pass 1: Decay pheromone - apply persistence before agents sense it
    {
      name: "decayTrail",
      program: "diffuse",
      inputs: {
        trailTex: "global_physarum_pheromone"
      },
      uniforms: {
        decay: "decay",
        resetState: "resetState"
      },
      outputs: {
        fragColor: "global_physarum_pheromone"
      }
    },

    // Pass 2: Update agent state (sensor-based steering)
    {
      name: "agent",
      program: "agent",
      drawBuffers: 3,
      inputs: {
        xyzTex: "global_xyz",
        velTex: "global_vel",
        rgbaTex: "global_rgba",
        // Read pheromone texture for sensor feedback
        trailTex: "global_physarum_pheromone",
        // Read input for field attraction
        inputTex: "inputTex"
      },
      uniforms: {
        moveSpeed: "moveSpeed",
        turnSpeed: "turnSpeed",
        sensorAngle: "sensorAngle",
        sensorDistance: "sensorDistance",
        inputWeight: "inputWeight"
      },
      outputs: {
        outXYZ: "global_xyz",
        outVel: "global_vel",
        outRGBA: "global_rgba"
      }
    },

    // Pass 3: Copy decayed pheromone to write buffer before deposit
    {
      name: "copy",
      program: "passthrough",
      inputs: {
        inputTex: "global_physarum_pheromone"
      },
      outputs: {
        fragColor: "global_physarum_pheromone"
      }
    },

    // Pass 4: Deposit - scatter agent pheromones
    {
      name: "deposit",
      program: "deposit",
      drawMode: "points",
      count: 'input', // Derive from xyzTex dimensions for dynamic stateSize
      blend: true,
      inputs: {
        xyzTex: "global_xyz",
        rgbaTex: "global_rgba"
      },
      uniforms: {
        deposit: "deposit"
      },
      outputs: {
        fragColor: "global_physarum_pheromone"
      }
    },

    // Pass 5: Copy input texture to output for 2D chain continuity
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
