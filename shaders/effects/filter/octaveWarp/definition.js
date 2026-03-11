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
      min: 1,
      max: 10,
      step: 0.1,
      randMax: 5,
      ui: {
        label: "scale",
        control: "slider"
      }
    },
    octaves: {
      type: "int",
      default: 3,
      uniform: "octaves",
      min: 1,
      max: 5,
      step: 1,
      ui: {
        label: "octaves",
        control: "slider"
      }
    },
    displacement: {
      type: "float",
      default: 0.2,
      uniform: "displacement",
      min: 0,
      max: 1,
      step: 0.01,
      randMax: 0.5,
      ui: {
        label: "displacement",
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
    wrap: {
      type: "int",
      default: 0,
      uniform: "wrap",
      choices: { mirror: 0, repeat: 1, clamp: 2 },
      ui: {
        label: "wrap",
        control: "dropdown"
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
        wrap: "wrap"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
