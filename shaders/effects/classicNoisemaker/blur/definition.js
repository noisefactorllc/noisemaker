import { Effect } from '../../../src/runtime/effect.js'

/**
 * Blur
 * Two-pass blur: downsample to coarse buffer, then upsample with interpolation
 */
export default new Effect({
  name: "Blur",
  namespace: "classicNoisemaker",
  func: "blur",
  tags: ["util"],

  description: "Gaussian blur",
  globals: {
    amount: {
        type: "float",
        default: 10,
        uniform: "amount",
        min: 1,
        max: 64,
        step: 1,
        ui: {
            label: "amount",
            control: "slider"
        }
    },
    splineOrder: {
        type: "int",
        default: 3,
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
  textures: {
    blurDownsample: {
      width: 64,
      height: 64,
      format: "rgba16float"
    }
  },
  passes: [
    {
      name: "downsample",
      program: "blur",
      viewport: { width: 64, height: 64 },
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "blurDownsample"
      }
    },
    {
      name: "upsample",
      program: "blurUpsample",
      inputs: {
        downsampleTex: "blurDownsample",
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
