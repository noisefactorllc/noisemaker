import { Effect } from '../../../src/runtime/effect.js'

/**
 * filter/pinch - Pinch distortion
 * Direct port of nd.warp's pinch mode
 */
export default new Effect({
  name: "Pinch",
  namespace: "filter",
  func: "pinch",
  tags: ["distort"],

  description: "Pinch distortion toward center",
  globals: {
    strength: {
      type: "float",
      default: 25,
      uniform: "strength",
      min: 0,
      max: 100,
      ui: {
        label: "strength",
        control: "slider"
      }
    },
    aspectLens: {
      type: "boolean",
      default: true,
      uniform: "aspectLens",
      ui: {
        label: "1:1 aspect",
        control: "checkbox"
      }
    },
    wrap: {
      type: "int",
      default: 0,
      uniform: "wrap",
      choices: {
        mirror: 0,
        repeat: 1,
        clamp: 2
      },
      ui: {
        label: "wrap",
        control: "dropdown"
      }
    },
    rotation: {
      type: "float",
      default: 0,
      uniform: "rotation",
      min: -180,
      max: 180,
      ui: {
        label: "rotation",
        control: "slider"
      }
    }
  },
  passes: [
    {
      name: "render",
      program: "pinch",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
