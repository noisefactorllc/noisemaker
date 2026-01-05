import { Effect } from '../../../src/runtime/effect.js'

/**
 * Lenia - Particle Lenia simulation
 *
 * Common Agent Architecture middleware:
 * - Reads agent state from pipeline inputs (global_xyz, global_vel, global_rgba)
 * - Applies Particle Lenia dynamics (kernel-based attraction + repulsion)
 * - Writes updated state back to global textures
 *
 * State format (matching pointsEmit):
 * - xyz: [x, y, z, alive_flag]  (x,y in normalized [0,1])
 * - vel: [vx, vy, age, seed]    (velocity for momentum-based motion)
 * - rgba: [r, g, b, a]          (agent color from pointsEmit)
 *
 * Algorithm based on: https://google-research.github.io/self-organising-systems/particle-lenia/
 *
 * Key equations:
 * - Lenia field U(x) = Σ K(||x - p_i||) where K is a gaussian shell kernel
 * - Growth field G(u) = exp(-((u - μ_G) / σ_G)²)
 * - Repulsion field R(x) = (c_rep/2) * Σ max(1 - ||x - p_i||, 0)²
 * - Energy E = R - G
 * - Motion: dp/dt = -∇E (gradient descent on local energy)
 *
 * Performance optimization:
 * - Particles deposit to density texture (O(n) point sprites)
 * - Kernel convolution applied to texture (O(resolution² × radius²))
 * - Agents sample convolved field (O(n))
 * - Total: O(n + resolution² × radius²) instead of O(n²)
 *
 * Usage: pointsEmit().lenia().pointsRender().write(o0)
 */
export default new Effect({
  name: "Lenia",
  namespace: "points",
  func: "lenia",
  tags: ["sim"],

  description: "Particle Lenia artificial life simulation",

  // Private textures for field computation
  textures: {
    global_lenia_density: {
      width: "50%",
      height: "50%",
      format: "rgba16f"
    },
    global_lenia_field: {
      width: "50%",
      height: "50%",
      format: "rgba16f"
    }
  },

  // Expose outputs to pipeline for downstream effects
  outputXyz: "global_xyz",
  outputVel: "global_vel",
  outputRgba: "global_rgba",

  globals: {
    // Kernel parameters (K - the attraction shell)
    muK: {
      type: "float",
      default: 25.0,
      uniform: "muK",
      min: 1.0,
      max: 30.0,
      step: 0.5,
      ui: {
        label: "kernel μ",
        control: "slider",
        category: "kernel"
      }
    },
    sigmaK: {
      type: "float",
      default: 5.0,
      uniform: "sigmaK",
      min: 0.1,
      max: 10.0,
      step: 0.1,
      ui: {
        label: "kernel σ",
        control: "slider",
        category: "kernel"
      }
    },
    // Growth parameters (G - the target density)
    muG: {
      type: "float",
      default: 0.25,
      uniform: "muG",
      min: 0.1,
      max: 2.0,
      step: 0.01,
      ui: {
        label: "growth μ",
        control: "slider",
        category: "growth"
      }
    },
    sigmaG: {
      type: "float",
      default: 0.15,
      uniform: "sigmaG",
      min: 0.01,
      max: 0.5,
      step: 0.01,
      ui: {
        label: "growth σ",
        control: "slider",
        category: "growth"
      }
    },
    // Repulsion strength
    repulsion: {
      type: "float",
      default: 0.5,
      uniform: "repulsion",
      min: 0.0,
      max: 5.0,
      step: 0.1,
      ui: {
        label: "repulsion",
        control: "slider",
        category: "motion"
      }
    },
    // Time step
    dt: {
      type: "float",
      default: 0.25,
      uniform: "dt",
      min: 0.01,
      max: 0.5,
      step: 0.01,
      ui: {
        label: "time step",
        control: "slider",
        category: "motion"
      }
    },
    // Search radius (kernel convolution radius)
    searchRadius: {
      type: "float",
      default: 25.0,
      uniform: "searchRadius",
      min: 5.0,
      max: 40.0,
      step: 1.0,
      ui: {
        label: "search radius",
        control: "slider",
        category: "kernel"
      }
    },
    // Deposit amount per particle
    depositAmount: {
      type: "float",
      default: 3.6,
      uniform: "depositAmount",
      min: 0.1,
      max: 5.0,
      step: 0.1,
      ui: {
        label: "deposit",
        control: "slider",
        category: "kernel"
      }
    }
  },

  passes: [
    // Pass 1: Clear density texture
    {
      name: "clear",
      program: "clear",
      inputs: {},
      outputs: {
        fragColor: "global_lenia_density"
      }
    },

    // Pass 2: Deposit particles to density texture
    {
      name: "deposit",
      program: "deposit",
      drawMode: "points",
      count: 4194304, // Max for 2048x2048 state texture
      blend: true,
      inputs: {
        xyzTex: "global_xyz"
      },
      uniforms: {
        depositAmount: "depositAmount"
      },
      outputs: {
        fragColor: "global_lenia_density"
      }
    },

    // Pass 3: Convolve density with K(r) kernel
    {
      name: "convolve",
      program: "convolve",
      inputs: {
        densityTex: "global_lenia_density"
      },
      uniforms: {
        muK: "muK",
        sigmaK: "sigmaK",
        searchRadius: "searchRadius"
      },
      outputs: {
        fragColor: "global_lenia_field"
      }
    },

    // Pass 4: Update particle state from field
    {
      name: "agent",
      program: "agent_field",
      drawBuffers: 3,
      inputs: {
        xyzTex: "global_xyz",
        velTex: "global_vel",
        rgbaTex: "global_rgba",
        fieldTex: "global_lenia_field"
      },
      uniforms: {
        muG: "muG",
        sigmaG: "sigmaG",
        repulsion: "repulsion",
        dt: "dt"
      },
      outputs: {
        outXYZ: "global_xyz",
        outVel: "global_vel",
        outRGBA: "global_rgba"
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
