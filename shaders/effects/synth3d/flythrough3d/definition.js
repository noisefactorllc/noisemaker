import { Effect } from '../../../src/runtime/effect.js'

/**
 * synth3d/flythrough3d - 3D fractal flythrough volume generator
 *
 * Generates a camera-relative 3D fractal volume for deep interior flythroughs.
 * The volume of interest (VOI) moves with the camera, sampling fractal space
 * around a spline-based flight path with collision avoidance.
 *
 * Key features:
 * - Mandelbulb and Mandelbox (interior cavern) fractals
 * - Camera-relative VOI: voxels sample world space around the camera
 * - Distance estimation for stable shell rendering and collision avoidance
 * - Smooth spline-based camera path with arc-length parameterization
 * - Orbit trap and iteration-based coloring
 * - Hybrid density: thin shell + soft interior haze
 *
 * Usage:
 *   flythrough3d().render3d().write(o0)
 *   flythrough3d(fractalType: mandelbox, speed: 0.5).render3d().write(o0)
 */
export default new Effect({
  name: "Flythrough3D",
  namespace: "synth3d",
  func: "flythrough3d",
  tags: ["3d", "fractal"],

  description: "3D fractal flythrough with camera-relative volume",
  textures: {
    volumeCache: {
      width: { param: 'volumeSize', default: 64 },
      height: { param: 'volumeSize', power: 2, default: 4096 },
      format: "rgba16f"
    },
    geoBuffer: {
      width: { param: 'volumeSize', default: 64 },
      height: { param: 'volumeSize', power: 2, default: 4096 },
      format: "rgba16f"
    }
  },
  globals: {
    volumeSize: {
      type: "int",
      default: 64,
      uniform: "volumeSize",
      choices: {
        x16: 16,
        x32: 32,
        x64: 64,
        x128: 128
      },
      "randChoices": [16, 32, 64],
      ui: {
        label: "volume size",
        control: "dropdown"
      }
    },
    type: {
      type: "int",
      default: 0,  // Mandelbulb by default (Mandelbox currently has issues)
      // GPU uniform renamed from `type` to `noiseType` because `type` is a
      // reserved keyword in WGSL — Dawn fails to parse `var<uniform> type: i32;`.
      uniform: "noiseType",
      choices: {
        mandelbulb: 0,
        mandelbox: 1
      },
      ui: {
        label: "fractal type",
        control: "dropdown"
      }
    },
    // Mandelbulb power (spherical coordinate exponent)
    // For Mandelbox, this is repurposed as the scale parameter
    power: {
      type: "float",
      default: 8.0,
      min: -3.0,
      max: 16,
      uniform: "power",
      ui: {
        label: "power/scale",
        control: "slider",
        category: "fractal"
      }
    },
    iterations: {
      type: "int",
      default: 12,
      min: 4,
      max: 24,
      uniform: "iterations",
      ui: {
        label: "iterations",
        control: "slider",
        category: "fractal"
      }
    },
    bailout: {
      type: "float",
      default: 4.0,
      min: 1,
      max: 16,
      uniform: "bailout",
      ui: {
        label: "bailout",
        control: "slider",
        category: "fractal"
      }
    },
    // Flythrough speed (world units per time unit)
    speed: {
      type: "float",
      default: 0.2,
      min: 0,
      max: 1.0,
      zero: 0,
      uniform: "speed",
      ui: {
        label: "speed",
        control: "slider",
        category: "camera"
      }
    },
    // VOI extent (half-width in world units)
    voiSize: {
      type: "float",
      default: 0.5,
      min: 0.1,
      max: 2.0,
      uniform: "voiSize",
      ui: {
        label: "view size",
        control: "slider",
        category: "camera"
      }
    },
    seed: {
      type: "int",
      default: 0,
      min: 0,
      max: 100,
      uniform: "seed",
      ui: {
        control: false
      }
    }
  },
  paramAliases: { fractalType: 'type' },
  passes: [
    {
      name: "precompute",
      program: "precompute",
      drawBuffers: 2,
      viewport: {
        width: { param: 'volumeSize', default: 64 },
        height: { param: 'volumeSize', power: 2, default: 4096 }
      },
      inputs: {},
      outputs: {
        color: "volumeCache",
        geoOut: "geoBuffer"
      }
    }
  ],
  outputTex3d: "volumeCache",
  outputGeo: "geoBuffer"
})
