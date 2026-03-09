import { Effect } from '../../../src/runtime/effect.js'

/**
 * Lens Warp
 * Noise-driven radial lens distortion
 */
export default new Effect({
  name: "Lens Warp",
  namespace: "filter",
  func: "lensWarp",
  tags: ["distort"],

  description: "Noise-driven radial lens distortion",
  globals: {
    displacement: {
      type: "float",
      default: 0.005,
      uniform: "displacement",
      min: 0,
      max: 0.05,
      step: 0.001,
      zero: 0,
      ui: {
        label: "displacement",
        control: "slider"
      }
    }
  },
  passes: [
    {
      name: "main",
      program: "lensWarp",
      inputs: {
        inputTex: "inputTex"
      },
      uniforms: {
        displacement: "displacement"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
