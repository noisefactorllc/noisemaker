import { Effect } from '../../../src/runtime/effect.js'

/**
 * Vaseline - N-tap blur with edge-weighted blending
 * Uses golden angle spiral kernel for smooth blur, stronger at edges
 */
export default new Effect({
  name: "Vaseline",
  namespace: "filter",
  func: "vaseline",
  tags: ["util"],

  description: "Vaseline lens blur effect",
  globals: {
    alpha: {
        type: "float",
        default: 0.5,
        uniform: "alpha",
        min: 0,
        max: 1,
        step: 0.01,
        ui: {
            label: "alpha",
            control: "slider"
        }
    }
  },
  passes: [
    {
      name: "main",
      program: "upsample",
      inputs: {
        inputTex: "inputTex"
      },
      uniforms: {
        alpha: "alpha"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
