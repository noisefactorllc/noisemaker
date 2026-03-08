import { Effect } from '../../../src/runtime/effect.js'

/**
 * Vaseline - intense bloom at edges, blending to original toward center
 * Uses same N-tap bloom approach as bloom effect, with edge mask
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
  textures: {
    _vaselineDownsample: {
      width: 64,
      height: 64,
      format: "rgba16float"
    }
  },
  passes: [
    {
      name: "downsample",
      program: "downsample",
      inputs: {
        inputTex: "inputTex"
      },
      uniforms: {},
      outputs: {
        fragColor: "_vaselineDownsample"
      }
    },
    {
      name: "upsample",
      program: "upsample",
      inputs: {
        inputTex: "inputTex",
        downsampleBuffer: "_vaselineDownsample"
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
