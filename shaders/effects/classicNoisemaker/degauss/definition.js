import { Effect } from '../../../src/runtime/effect.js'

/**
 * Degauss
 * /shaders/effects/degauss/degauss.wgsl
 */
export default new Effect({
  name: "Degauss",
  namespace: "classicNoisemaker",
  func: "degauss",

  description: "CRT degauss effect",
  globals: {
    displacement: {
        type: "float",
        default: 0.0625,
        uniform: "displacement",
        min: 0,
        max: 0.25,
        step: 0.001,
        ui: {
            label: "Displacement",
            control: "slider"
        }
    },
    speed: {
        type: "float",
        default: 1.0,
        uniform: "speed",
        min: 0.0,
        max: 2.0,
        step: 0.1,
        ui: {
            label: "Speed",
            control: "slider"
        }
    }
},
  passes: [
    {
      name: "main",
      program: "degauss",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        color: "outputTex"
      }
    }
  ]
})
