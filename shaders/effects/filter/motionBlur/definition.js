import { Effect } from '../../../src/runtime/effect.js'

/**
 * Motion Blur - Simple motion blur effect
 *
 * A simplified feedback effect that just mixes the current frame with
 * the previous frame. No blend modes, transforms, or color adjustments.
 * The amount control maps 0-100 to roughly 0-40% mix of feedback's equivalent.
 */
export default new Effect({
  name: "Motion Blur",
  func: "motionBlur",
  tags: ["lens"],

  description: "Simple motion blur via frame blending",
  globals: {
    resetState: {
      type: "boolean",
      default: false,
      uniform: "resetState",
      ui: {
        control: "button",
        buttonLabel: "reset",
        label: "state"
      }
    },
    amount: {
      type: "float",
      default: 50,
      min: 0,
      max: 100,
      uniform: "amount",
      ui: {
        label: "amount",
        control: "slider"
      }
    }
  },
  textures: {
    _selfTex: {
      width: "input",
      height: "input",
      format: "rgba8unorm"
    }
  },
  passes: [
    {
      name: "main",
      program: "motionBlur",
      inputs: {
        inputTex: "inputTex",
        selfTex: "_selfTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    },
    {
      name: "feedback",
      program: "copy",
      inputs: {
        inputTex: "outputTex"
      },
      outputs: {
        fragColor: "_selfTex"
      }
    }
  ]
})
