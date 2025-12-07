import { Effect } from '../../../src/runtime/effect.js'

/**
 * JPEG Decimate
 * /shaders/effects/jpeg_decimate/jpeg_decimate.wgsl
 */
export default new Effect({
  name: "JpegDecimate",
  namespace: "classicNoisemaker",
  func: "jpegDecimate",

  description: "JPEG compression artifacts",
  globals: {},
  passes: [
    {
      name: "main",
      program: "jpegDecimate",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        outputBuffer: "outputTex"
      }
    }
  ]
})
