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
    frequency: {
      type: "float",
      default: 2,
      uniform: "frequency",
      min: 0.1,
      max: 10,
      step: 0.1,
      ui: {
        label: "Frequency",
        control: "slider"
      }
    },
    octaves: {
      type: "float",
      default: 5,
      uniform: "octaves",
      min: 1,
      max: 10,
      step: 1,
      ui: {
        label: "Octaves",
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
        label: "Displacement",
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
        label: "Speed",
        control: "slider"
      }
    },
    splineOrder: {
      type: "float",
      default: 2,
      uniform: "splineOrder",
      min: 0,
      max: 3,
      step: 1,
      ui: {
        label: "Spline Order",
        control: "slider"
      }
    }
  },
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
