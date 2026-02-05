import { Effect } from '../../../src/runtime/effect.js'

/**
 * filter/waves - Sine wave distortion
 * Direct port of nd.warp's waves mode
 */
export default new Effect({
  name: "Waves",
  namespace: "filter",
  func: "waves",
  tags: ["distort"],

  description: "Sine wave distortion",
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
    scale: {
      type: "float",
      default: 1,
      uniform: "scale",
      min: -5,
      max: 5,
      ui: {
        label: "scale",
        control: "slider"
      }
    },
    speed: {
      type: "float",
      default: 0,
      uniform: "speed",
      min: -5,
      max: 5,
      ui: {
        label: "speed",
        control: "slider"
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
      program: "waves",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
