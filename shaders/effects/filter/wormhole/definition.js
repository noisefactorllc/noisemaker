import { Effect } from '../../../src/runtime/effect.js'

/**
 * filter/wormhole - Luminance-driven displacement field
 * GPU gather adaptation of Python scatter_nd wormhole
 */
export default new Effect({
  name: "Wormhole",
  namespace: "filter",
  func: "wormhole",
  tags: ["distort"],

  description: "Luminance-driven displacement field",
  globals: {
    kink: {
      type: "float",
      default: 1,
      uniform: "kink",
      min: 0,
      max: 5,
      step: 0.1,
      ui: {
        label: "kink",
        control: "slider"
      }
    },
    stride: {
      type: "float",
      default: 1,
      uniform: "stride",
      min: 0,
      max: 2,
      step: 0.01,
      ui: {
        label: "stride",
        control: "slider"
      }
    },
    alpha: {
      type: "float",
      default: 1,
      uniform: "alpha",
      min: 0,
      max: 1,
      step: 0.01,
      ui: {
        label: "alpha",
        control: "slider"
      }
    },
  },
  passes: [
    {
      name: "main",
      program: "wormhole",
      inputs: {
        inputTex: "inputTex"
      },
      uniforms: {
        kink: "kink",
        stride: "stride",
        alpha: "alpha"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
