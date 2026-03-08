import { Effect } from '../../../src/runtime/effect.js'

/**
 * filter/octaveWarp - Per-octave noise warp distortion
 * At each octave, generates noise at frequency×2^i, displaces UV,
 * samples the input at displaced position, accumulating warps.
 * Displacement decreases with each octave (displacement / 2^i).
 */
export default new Effect({
  name: "Octave Warp",
  namespace: "filter",
  func: "octaveWarp",
  tags: ["distort"],

  description: "Per-octave noise warp distortion",
  globals: {
    freq: {
      type: "float",
      default: 2,
      uniform: "frequency",
      min: 0.1,
      max: 10,
      step: 0.1,
      ui: {
        label: "frequency",
        control: "slider"
      }
    },
    octaves: {
      type: "int",
      default: 5,
      uniform: "octaves",
      min: 1,
      max: 10,
      step: 1,
      ui: {
        label: "octaves",
        control: "slider"
      }
    },
    displacement: {
      type: "float",
      default: 0.1,
      uniform: "displacement",
      min: 0,
      max: 1,
      step: 0.01,
      ui: {
        label: "displacement",
        control: "slider"
      }
    },
    speed: {
      type: "float",
      default: 1,
      uniform: "speed",
      min: 0,
      max: 5,
      step: 0.1,
      ui: {
        label: "speed",
        control: "slider"
      }
    },
    splineOrder: {
      type: "int",
      default: 2,
      uniform: "splineOrder",
      min: 0,
      max: 3,
      step: 1,
      ui: {
        label: "spline order",
        control: "slider"
      }
    }
  },
  paramAliases: { frequency: 'freq' },
  passes: [
    {
      name: "render",
      program: "octaveWarp",
      inputs: {
        inputTex: "inputTex"
      },
      uniforms: {
        frequency: "frequency",
        octaves: "octaves",
        displacement: "displacement",
        speed: "speed",
        splineOrder: "splineOrder"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
