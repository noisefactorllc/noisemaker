import { Effect } from '../../../src/runtime/effect.js'

/**
 * filter/emboss - color convolution plus opt-in gray relief.
 * The color style remains the default visual-semver contract.
 */
export default new Effect({
  name: "Emboss",
  namespace: "filter",
  func: "emboss",
  tags: ["edges"],

  description: "Emboss relief with color convolution or opt-in gray directional edge tracing",
  globals: {
    style: {
      type: "int",
      default: 0,
      define: "STYLE",
      choices: {
        color: 0,
        gray: 1
      },
      ui: {
        label: "style",
        control: "dropdown"
      }
    },
    amount: {
      type: "float",
      default: 1.0,
      uniform: "amount",
      min: 0.1,
      max: 5,
      ui: {
        label: "amount",
        control: "slider",
        enabledBy: { param: "style", eq: 0 }
      }
    },
    angle: {
      type: "float",
      default: 135,
      uniform: "angle",
      min: -360,
      max: 360,
      ui: {
        label: "angle",
        control: "slider"
      }
    },
    height: {
      type: "float",
      default: 1,
      uniform: "height",
      min: 1,
      max: 10,
      ui: {
        label: "height",
        control: "slider"
      }
    },
    colorAmount: {
      type: "float",
      default: 100,
      uniform: "colorAmount",
      min: 0,
      max: 100,
      ui: {
        label: "color amount",
        control: "slider",
        enabledBy: { param: "style", eq: 1 }
      }
    }
  },
  passes: [
    {
      name: "render",
      program: "emboss",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
