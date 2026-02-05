import { Effect } from '../../../src/runtime/effect.js'

/**
 * Lens Warp
 * /shaders/effects/lens_warp/lens_warp.wgsl
 */
export default new Effect({
  name: "LensWarp",
  namespace: "classicNoisemaker",
  func: "lensWarp",
  tags: ["distort"],

  description: "Lens warp distortion",
  globals: {
    displacement: {
        type: "float",
        default: 0.0625,
        uniform: "displacement",
        min: 0,
        max: 0.5,
        step: 0.0025,
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
        outputBuffer: "outputTex"
      }
    }
  ]
})
