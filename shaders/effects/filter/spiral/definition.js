import { Effect } from '../../../src/runtime/effect.js'

/**
 * filter/spiral - Spiral distortion
 * Direct port of nd.warp's spiral modes (CW/CCW combined)
 */
export default new Effect({
  name: "Spiral",
  namespace: "filter",
  func: "spiral",
  tags: ["distort"],

  description: "Spiral distortion",
  globals: {
    strength: {
      type: "float",
      default: 25,
      uniform: "strength",
      min: -100,
      max: 100,
      zero: 0,
      ui: {
        label: "strength",
        control: "slider"
      }
    },
    speed: {
      type: "int",
      default: 0,
      uniform: "speed",
      min: -5,
      max: 5,
      ui: {
        label: "speed",
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
      program: "spiral",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
