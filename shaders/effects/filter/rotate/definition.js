import { Effect } from '../../../src/runtime/effect.js'

/**
 * nu/rot - Rotate image 0..1 (0..360 degrees)
 */
export default new Effect({
  name: "Rotate",
  namespace: "filter",
  func: "rotate",
  tags: ["transform"],

  description: "Rotate image by specified angle",
  globals: {
    rotation: {
      type: "float",
      default: 45,
      uniform: "rotation",
      min: -180,
      max: 180,
      step: 0.01,
      zero: 0,
      ui: {
        label: "rotation",
        control: "slider"
      }
    },
    wrap: {
      type: "int",
      default: 1,
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
    speed: {
      type: "int",
      default: 0,
      uniform: "speed",
      min: -4,
      max: 4,
      zero: 0,
      randMin: -2,
      randMax: 2,
      ui: { label: "speed", control: "slider" }
    }
  },
  passes: [
    {
      name: "render",
      program: "rot",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
