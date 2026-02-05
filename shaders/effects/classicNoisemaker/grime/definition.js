import { Effect } from '../../../src/runtime/effect.js'

/**
 * Grime
 * Dusty speckles and grime overlay
 */
export default new Effect({
  name: "Grime",
  namespace: "classicNoisemaker",
  func: "grime",
  tags: ["noise"],

  description: "Grunge/grime texture overlay",
  globals: {
    strength: {
        type: "float",
        default: 1,
        uniform: "strength",
        min: 0,
        max: 5,
        step: 0.1,
        ui: {
            label: "strength",
            control: "slider"
        }
    },
    debugMode: {
        type: "int",
        default: 0,
        uniform: "debugMode",
        min: 0,
        max: 4,
        step: 1,
        ui: {
            label: "debug mode",
            control: "slider"
        }
    },
    speed: {
        type: "float",
        default: 1.0,
        uniform: "speed",
        min: 0,
        max: 5,
        step: 0.1,
        ui: {
            label: "speed",
            control: "slider"
        }
    }
  },
  passes: [
    {
      name: "main",
      program: "grime",
      inputs: {
        inputTex: "inputTex"
      },
      uniforms: {
        strength: "strength",
        debugMode: "debugMode",
        speed: "speed"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
