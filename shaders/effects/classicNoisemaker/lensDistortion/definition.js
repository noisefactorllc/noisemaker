import { Effect } from '../../../src/runtime/effect.js'

/**
 * Lens Distortion
 * /shaders/effects/lens_distortion/lens_distortion.wgsl
 */
export default new Effect({
  name: "LensDistortion",
  namespace: "classicNoisemaker",
  func: "lensDistortion",
  tags: ["distort"],

  description: "Lens barrel/pincushion distortion",
  globals: {
    displacement: {
        type: "float",
        default: 1,
        uniform: "displacement",
        min: -2,
        max: 2,
        step: 0.01,
        ui: {
            label: "displacement",
            control: "slider"
        }
    }
},
  passes: [
    {
      name: "main",
      program: "lensDistortion",
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
