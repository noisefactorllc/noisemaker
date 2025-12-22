import { Effect } from '../../../src/runtime/effect.js'

/**
 * Particle Life - Type-based attraction/repulsion particle simulation
 *
 * Architecture (GPGPU via render passes):
 * - Uses ForceMatrix texture encoding type-pair interaction strengths
 * - Multi-type particles with radial force curves
 * - Spatial hashing for efficient neighbor queries
 * - Multi-pass: force -> integrate -> deposit -> diffuse -> render
 *
 * Agent state format:
 * - State1: [posX, posY, velX, velY] - position and velocity
 * - State2: [typeId, mass, age, flags] - particle attributes
 * - State3: [r, g, b, a] - color (derived from type or sampled)
 *
 * Force evaluation:
 * - ForceMatrix[typeA][typeB] defines attraction (>0) or repulsion (<0)
 * - Radial force curve with inner repulsion, mid-range attraction, outer cutoff
 * - Forces accumulate from all neighbors within perception radius
 *
 * Optional extensions:
 * - Chemistry: type transitions based on neighbor composition
 * - Spawn/death lifecycle management
 */
export default new Effect({
  name: "Particle Life",
  namespace: "synth",
  func: "particleLife",
  tags: ["sim"],

  description: "Type-based attraction/repulsion particle simulation",
  textures: {
    // Agent state buffers (256x256 = 65536 particles max)
    // Using rgba16f to stay within MRT color attachment limits (32 bytes max)
    globalPLifeState1: { width: 256, height: 256, format: "rgba16f" },
    globalPLifeState2: { width: 256, height: 256, format: "rgba16f" },
    globalPLifeState3: { width: 256, height: 256, format: "rgba16f" },
    // Force accumulation buffer
    globalPLifeForce: { width: 256, height: 256, format: "rgba16f" },
    // Trail accumulation
    globalPLifeTrail: { width: "100%", height: "100%", format: "rgba16f" },
    // ForceMatrix: 8x8 texture for 8 types, each pixel encodes force params
    // R = attraction strength (-1 to 1), G = preferred distance, B = curve shape
    globalForceMatrix: { width: 8, height: 8, format: "rgba16f" }
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
      default: 0,
      uniform: "colorMode",
      ui: { control: false }
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
    // Radial parameters
    minRadius: {
      type: "float",
      default: 10,
      uniform: "minRadius",
      min: 1,
      max: 50,
      step: 1,
      ui: {
        label: "min radius",
        control: "slider",
        category: "forces"
      }
    },
    maxRadius: {
      type: "float",
      default: 80,
      uniform: "maxRadius",
      min: 20,
      max: 200,
      step: 1,
      ui: {
        label: "max radius",
        control: "slider",
        category: "forces"
      }
    },
    // Motion parameters
    maxSpeed: {
      type: "float",
      default: 3.0,
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
    // Agent density and lifecycle
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
    // Trail and blending
    trailIntensity: {
      type: "float",
      default: 95,
      uniform: "trailIntensity",
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
      default: 30,
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
    },
    randomizeMatrix: {
      type: "boolean",
      default: false,
      uniform: "randomizeMatrix",
      ui: {
        control: "button",
        buttonLabel: "randomize",
        label: "matrix"
      }
    }
  },
  passes: [
    // Pass 0: Generate/update ForceMatrix
    {
      name: "matrix",
      program: "matrix",
      inputs: {
        prevMatrix: "globalForceMatrix"
      },
      uniforms: {
        typeCount: "typeCount",
        matrixSeed: "matrixSeed",
        symmetricForces: "symmetricForces"
      },
      outputs: {
        fragColor: "globalForceMatrix"
      }
    },
    // Pass 1: Evaluate pairwise forces
    {
      name: "force",
      program: "force",
      inputs: {
        stateTex1: "globalPLifeState1",
        stateTex2: "globalPLifeState2",
        forceMatrix: "globalForceMatrix"
      },
      uniforms: {
        typeCount: "typeCount",
        attractionScale: "attractionScale",
        repulsionScale: "repulsionScale",
        minRadius: "minRadius",
        maxRadius: "maxRadius"
      },
      outputs: {
        fragColor: "globalPLifeForce"
      }
    },
    // Pass 2: Integrate forces, update state
    {
      name: "integrate",
      program: "integrate",
      drawBuffers: 3,
      inputs: {
        stateTex1: "globalPLifeState1",
        stateTex2: "globalPLifeState2",
        stateTex3: "globalPLifeState3",
        forceTex: "globalPLifeForce",
        tex: "tex"
      },
      uniforms: {
        maxSpeed: "maxSpeed",
        friction: "friction",
        boundaryMode: "boundaryMode",
        typeCount: "typeCount",
        colorMode: "colorMode"
      },
      outputs: {
        outState1: "globalPLifeState1",
        outState2: "globalPLifeState2",
        outState3: "globalPLifeState3"
      }
    },
    // Pass 3: Diffuse/decay trail (before deposit to avoid feedback)
    {
      name: "diffuse",
      program: "diffuse",
      inputs: {
        sourceTex: "globalPLifeTrail"
      },
      uniforms: {
        trailIntensity: "trailIntensity"
      },
      outputs: {
        fragColor: "globalPLifeTrail"
      }
    },
    // Pass 4: Deposit particle trails as point sprites
    {
      name: "deposit",
      program: "deposit",
      drawMode: "points",
      count: 65536,
      blend: true,
      inputs: {
        stateTex1: "globalPLifeState1",
        stateTex3: "globalPLifeState3"
      },
      uniforms: {
        density: "density"
      },
      outputs: {
        fragColor: "globalPLifeTrail"
      }
    },
    // Pass 5: Final render composite
    {
      name: "render",
      program: "render",
      inputs: {
        trailTex: "globalPLifeTrail",
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
