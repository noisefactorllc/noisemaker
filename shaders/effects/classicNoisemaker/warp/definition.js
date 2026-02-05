import { Effect } from '../../../src/runtime/effect.js'

/**
 * Warp - multi-octave displacement using noise
 */
export default new Effect({
  name: "Warp",
  namespace: "classicNoisemaker",
  tags: ["distort"],
  func: "warp",

  description: "Perlin warp distortion",
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
      name: "main",
      program: "warp",
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
        color: "outputTex"
      }
    }
  ]
})
