import { Effect } from '../../../src/runtime/effect.js'

/**
 * Particle Life - Type-based attraction/repulsion particle simulation
 *
 * Common Agent Architecture middleware:
 * - Reads agent state from pipeline inputs (global_xyz, global_vel, global_rgba)
 * - Uses internal global_life_data for typeId/mass storage
 * - Uses internal global_force_matrix for type-pair interactions
 * - Applies particle life forces and writes back to global textures
 *
 * State format (matching pointsEmit + internal data):
 * - xyz: [x, y, 0, alive_flag]  (x,y in normalized coords [0,1])
 * - vel: [vx, vy, age, seed]    (velocity and metadata)
 * - rgba: [r, g, b, a]          (agent color from type)
 * - data: [typeId, mass, 0, 0]  (internal, effect-specific)
 *
 * Usage: pointsEmit().life().pointsRender().write(o0)
 */
export default new Effect({
  name: "Life",
  namespace: "points",
  func: "life",
  tags: ["sim", "agents"],

  description: "Type-based attraction/repulsion particle simulation",

  // Internal textures
  // global_life_data: Uses global_ prefix so it gets double-buffered ping-pong,
  // preventing feedback loops when reading and writing in the same pass.
  // Also gets scoped to the particle pipeline (e.g., global_life_data_node_1).
  textures: {
    // Effect-specific data: [typeId, mass, 0, 0]
    // Size matches particle textures via stateSize param
    global_life_data: {
      width: { param: 'stateSize', default: 256 },
      height: { param: 'stateSize', default: 256 },
      format: "rgba16f"
    },
    // ForceMatrix: 8x8 texture for 8 types
    // R = attraction strength (-1 to 1), G = preferred distance, B = curve shape
    force_matrix: { width: 8, height: 8, format: "rgba16f" }
  },

  // Expose outputs to pipeline for downstream effects (pointsRender)
  outputXyz: "global_xyz",
  outputVel: "global_vel",
  outputRgba: "global_rgba",

  globals: {
    // State size param - inherited from upstream pointsEmit
    stateSize: {
      type: "int",
      default: 256,
      uniform: "stateSize",
      ui: { control: false }  // Inherited from pointsEmit
    },
    // Type system
    typeCount: {
      type: "int",
      default: 6,
      uniform: "typeCount",
      min: 2,
      max: 8,
      step: 1,
      ui: {
        label: "types",
        control: "slider",
        category: "types"
      }
    },
    // Force parameters
    attractionScale: {
      type: "float",
      default: 1.0,
      uniform: "attractionScale",
      min: 0,
      max: 5,
      step: 0.1,
      ui: {
        label: "attraction",
        control: "slider",
        category: "forces"
      }
    },
    repulsionScale: {
      type: "float",
      default: 1.0,
      uniform: "repulsionScale",
      min: 0,
      max: 5,
      step: 0.1,
      ui: {
        label: "repulsion",
        control: "slider",
        category: "forces"
      }
    },
    // Radial parameters (normalized to [0,1] coords)
    minRadius: {
      type: "float",
      default: 0.01,
      uniform: "minRadius",
      min: 0.001,
      max: 0.05,
      step: 0.001,
      ui: {
        label: "min radius",
        control: "slider",
        category: "forces"
      }
    },
    maxRadius: {
      type: "float",
      default: 0.08,
      uniform: "maxRadius",
      min: 0.02,
      max: 0.2,
      step: 0.01,
      ui: {
        label: "max radius",
        control: "slider",
        category: "forces"
      }
    },
    // Motion parameters
    maxSpeed: {
      type: "float",
      default: 0.003,
      uniform: "maxSpeed",
      min: 0.0005,
      max: 0.01,
      step: 0.0001,
      ui: {
        label: "max speed",
        control: "slider",
        category: "motion"
      }
    },
    friction: {
      type: "float",
      default: 0.1,
      uniform: "friction",
      min: 0,
      max: 1,
      step: 0.01,
      ui: {
        label: "friction",
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
        bounce: 1
      },
      ui: {
        label: "boundary",
        control: "dropdown",
        category: "motion"
      }
    },
    // Random force matrix generation seed
    matrixSeed: {
      type: "float",
      default: 42,
      uniform: "matrixSeed",
      min: 0,
      max: 1000,
      step: 1,
      ui: {
        label: "matrix seed",
        control: "slider",
        category: "types"
      }
    },
    // Symmetry: if true, ForceMatrix[A][B] = ForceMatrix[B][A]
    symmetricForces: {
      type: "boolean",
      default: false,
      uniform: "symmetricForces",
      ui: {
        label: "symmetric",
        control: "checkbox",
        category: "types"
      }
    },
    // Show type color instead of sampled color
    useTypeColor: {
      type: "boolean",
      default: false,
      uniform: "useTypeColor",
      ui: {
        label: "show types",
        control: "checkbox",
        category: "types"
      }
    }
  },

  passes: [
    // Pass 1: Generate ForceMatrix (deterministic based on seed)
    {
      name: "matrix",
      program: "matrix",
      inputs: {},
      uniforms: {
        typeCount: "typeCount",
        matrixSeed: "matrixSeed",
        symmetricForces: "symmetricForces"
      },
      outputs: {
        fragColor: "force_matrix"
      }
    },

    // Pass 2: Agent update (combined force evaluation + integration)
    {
      name: "agent",
      program: "agent",
      drawBuffers: 4,
      inputs: {
        xyzTex: "global_xyz",
        velTex: "global_vel",
        rgbaTex: "global_rgba",
        dataTex: "global_life_data",
        forceMatrix: "force_matrix",
        inputTex: "inputTex"
      },
      uniforms: {
        typeCount: "typeCount",
        attractionScale: "attractionScale",
        repulsionScale: "repulsionScale",
        minRadius: "minRadius",
        maxRadius: "maxRadius",
        maxSpeed: "maxSpeed",
        friction: "friction",
        boundaryMode: "boundaryMode",
        matrixSeed: "matrixSeed",
        symmetricForces: "symmetricForces",
        useTypeColor: "useTypeColor"
      },
      outputs: {
        outXYZ: "global_xyz",
        outVel: "global_vel",
        outRGBA: "global_rgba",
        outData: "global_life_data"
      }
    },

    // Pass 3: Copy input texture to output for 2D chain continuity
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
