import { Effect } from '../../../src/runtime/effect.js'

/**
 * filter/spinBlur - Rotational (spin) blur around a center point
 * (Radial Blur, Spin mode). Averages a fixed 32-tap comb, each
 * tap rotated by an angle spanning -amount/2..+amount/2 degrees around
 * (centerX, centerY). Distinct from filter/zoomBlur, which covers
 * Radial Blur Zoom mode.
 */
export default new Effect({
  name: "Spin Blur",
  namespace: "filter",
  func: "spinBlur",
  tags: ["blur", "artist"],

  description: "Rotational blur around a center point (Radial Blur, Spin mode)",
  globals: {
    amount: {
      type: "float",
      default: 15,
      uniform: "amount",
      min: 1,
      max: 90,
      ui: {
        label: "amount",
        control: "slider"
      }
    },
    centerX: {
      type: "float",
      default: 0.5,
      uniform: "centerX",
      min: 0,
      max: 1,
      ui: {
        label: "center x",
        control: "slider"
      }
    },
    centerY: {
      type: "float",
      default: 0.5,
      uniform: "centerY",
      min: 0,
      max: 1,
      ui: {
        label: "center y",
        control: "slider"
      }
    }
  },
  passes: [
    {
      name: "render",
      program: "spinBlur",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
