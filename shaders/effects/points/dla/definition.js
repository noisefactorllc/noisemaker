import { Effect } from '../../../src/runtime/effect.js'

/**
 * DLA - Diffusion-Limited Aggregation
 *
 * Common Agent Architecture middleware:
 * - Reads agent state from pipeline (global_xyz, global_vel, global_rgba)
 * - Agents random walk until they find existing structure, then stick
 * - Maintains internal anchor grid for sticking detection (NOT visible to pointsRender)
 * - When agents stick, they are deposited to the anchor grid and marked dead for respawn
 * - Anchor points seeded randomly in center area at start, controlled by anchorDensity
 *
 * State format (matching pointsEmit):
 * - xyz: [x, y, 0, alive_flag]  (normalized [0,1] coords, w=1 alive, w=0 dead)
 * - vel: [seed, 0, 0, agentRand]  (seed for per-agent randomness)
 * - rgba: [r, g, b, a]          (color from pointsEmit)
 *
 * Usage: pointsEmit().dla().pointsRender().write(o0)
 */
export default new Effect({
  name: "Dla",
  namespace: "points",
  func: "dla",
  tags: ["sim"],

  description: "Diffusion-limited aggregation",

  // Internal simulation grid for anchor detection (NOT rendered by pointsRender)
  textures: {
    global_dla_grid: { width: "100%", height: "100%", format: "rgba16f" }
  },

  // Expose outputs to pipeline for downstream effects (pointsRender)
  outputXyz: "global_xyz",
  outputVel: "global_vel",
  outputRgba: "global_rgba",

  globals: {
    // stateSize must match pointsEmit (inherited, not displayed)
    stateSize: {
      type: "int",
      default: 256,
      uniform: "stateSize",
      ui: { control: false }
    },
    anchorDensity: {
      type: "float",
      default: 0.5,
      uniform: "anchorDensity",
      min: 0.01,
      max: 5.0,
      step: 0.01,
      ui: {
        label: "anchors",
        control: "slider",
        category: "chemistry"
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
        category: "agents"
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
    // Matte opacity (0=transparent background, 1=opaque)
    matteOpacity: {
      type: "float",
      default: 1.0,
      uniform: "matteOpacity",
      min: 0.0,
      max: 1.0,
      ui: {
        label: "bg opacity",
        control: "slider",
        category: "output"
      }
    }
  },

  passes: [
    // Pass 1: Initialize/decay anchor grid (seeds anchors on frame 1)
    {
      name: "initGrid",
      program: "initGrid",
      inputs: {
        gridTex: "global_dla_grid"
      },
      uniforms: {
        decay: "decay",
        anchorDensity: "anchorDensity"
      },
      outputs: {
        fragColor: "global_dla_grid"
      }
    },

    // Pass 2: Copy grid to write buffer for proper blending
    // After initGrid swaps, the write buffer is stale - copy fresh data
    {
      name: "copyGrid",
      program: "copyGrid",
      inputs: {
        gridTex: "global_dla_grid"
      },
      outputs: {
        fragColor: "global_dla_grid"
      }
    },

    // Pass 3: Agent walk and stick detection
    // Reads agent state from pointsEmit, updates positions
    // Marks stuck agents as dead (xyz.w = 0) for respawn
    {
      name: "agent",
      program: "agent",
      drawBuffers: 3,
      inputs: {
        xyzTex: "global_xyz",
        velTex: "global_vel",
        rgbaTex: "global_rgba",
        gridTex: "global_dla_grid",
        inputTex: "inputTex"
      },
      uniforms: {
        stride: "stride",
        inputWeight: "inputWeight",
        attrition: "attrition",
        stateSize: "stateSize"
      },
      outputs: {
        outXYZ: "global_xyz",
        outVel: "global_vel",
        outRGBA: "global_rgba"
      }
    },

    // Pass 4: Deposit stuck agents to anchor grid
    // Only agents that just stuck (checked via vel.y flag) are deposited
    {
      name: "depositGrid",
      program: "depositGrid",
      drawMode: "points",
      count: 'input', // Derive from xyzTex dimensions for dynamic stateSize
      blend: ["one", "one"],
      inputs: {
        xyzTex: "global_xyz",
        velTex: "global_vel",
        rgbaTex: "global_rgba"
      },
      uniforms: {
        deposit: "deposit"
      },
      outputs: {
        fragColor: "global_dla_grid"
      }
    },

    // Pass 5: Blend grid with input for visible output
    {
      name: "passthrough",
      program: "passthrough",
      inputs: {
        inputTex: "inputTex",
        gridTex: "global_dla_grid"
      },
      uniforms: {
        matteOpacity: "matteOpacity"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
