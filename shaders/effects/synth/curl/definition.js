import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Curl",
  namespace: "synth",
  func: "curl",
  tags: ["noise"],

  description: "3D curl noise using simplex noise",
  uniformLayout: {
    resolution: { slot: 0, components: 'xy' },
    time: { slot: 0, components: 'z' },
    aspectRatio: { slot: 0, components: 'w' },
    scale: { slot: 1, components: 'x' },
    seed: { slot: 1, components: 'y' },
    speed: { slot: 1, components: 'z' },
    // slot 1.w was octaves — now compile-time OCTAVES
    // slot 2.x was ridges — now compile-time RIDGES
    // slot 2.y was outputMode — now compile-time OUTPUT_MODE
    intensity: { slot: 2, components: 'z' }
  },
  globals: {
    scale: {
      type: "float",
      default: 16,
      uniform: "scale",
      min: 0.5,
      max: 20,
      ui: {
        label: "scale",
        control: "slider"
      }
    },
    octaves: {
      type: "int",
      default: 1,
      // Compile-time define. fbmSimplex3D's loop bound becomes static so the
      // ANGLE/Dawn compilers fully unroll it and DCE the unused iterations.
      // Curl calls fbmSimplex3D 12 times per pixel; with runtime octaves the
      // HLSL inlining exploded to ~36 simplex3D copies. With OCTAVES baked,
      // the default octaves=1 case compiles ~3x faster.
      define: "OCTAVES",
      min: 1,
      max: 3,
      ui: {
        label: "octaves",
        control: "slider"
      }
    },
    seed: {
      type: "int",
      default: 0,
      uniform: "seed",
      min: 0,
      max: 1000,
      ui: {
        label: "seed",
        control: "slider"
      }
    },
    ridges: {
      type: "boolean",
      default: true,
      // Compile-time define — small win but consistent with the pattern.
      define: "RIDGES",
      ui: {
        label: "ridges",
        control: "checkbox"
      }
    },
    intensity: {
      type: "float",
      default: 1.0,
      uniform: "intensity",
      min: 0,
      max: 2,
      ui: {
        label: "intensity",
        control: "slider"
      }
    },
    speed: {
      type: "int",
      default: 1,
      uniform: "speed",
      min: 0,
      max: 5,
      zero: 0,
      ui: {
        label: "speed",
        control: "slider"
      }
    },
    outputMode: {
      type: "int",
      default: 3,
      // Compile-time define. Small 5-way cascade at the end of main(); baking
      // it is more for consistency than perf — lets the compiler pick exactly
      // one branch.
      define: "OUTPUT_MODE",
      choices: {
        flowX: 0,
        flowY: 1,
        flowZ: 2,
        full: 3,
        magnitude: 4
      },
      ui: {
        label: "output",
        control: "dropdown"
      }
    }
  },
  passes: [
    {
      name: "render",
      program: "curl",
      inputs: {},
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
