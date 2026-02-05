import { Effect } from '../../../src/runtime/effect.js'

/**
 * Bloom
 *
 * Two-pass bloom effect with downsample and bicubic upsample.
 * Pass 1: Downsample input with highlight boost to smaller texture
 * Pass 2: Bicubic upsample and blend with original
 *
 * Mirrors the reference implementation in _to-port/nm/bloom/bloom.wgsl
 */
export default new Effect({
  name: "Bloom",
  namespace: "classicNoisemaker",
  func: "bloom",
  tags: ["util"],

  description: "Bloom/glow effect",
  globals: {
    alpha: {
      type: "float",
      default: 0.5,
      uniform: "bloomAlpha",
      min: 0,
      max: 1,
      step: 0.05,
      ui: {
        label: "alpha",
        control: "slider"
      }
    },
    downsampleSize: {
      type: "vec2",
      default: [64, 64],
      uniform: "downsampleSize",
        ui: {
            label: "downsample size"
        }}
  },
  textures: {
    _bloomDownsample: {
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
      outputs: {
        fragColor: "_bloomDownsample"
      }
    },
    {
      name: "upsample",
      program: "upsample",
      inputs: {
        inputTex: "inputTex",
        downsampleBuffer: "_bloomDownsample"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
