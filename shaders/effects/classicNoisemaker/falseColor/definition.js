import { Effect } from '../../../src/runtime/effect.js'

/**
 * False Color
 * /shaders/effects/false_color/false_color.wgsl
 */
export default new Effect({
  name: "FalseColor",
  namespace: "classicNoisemaker",
  func: "falseColor",

  description: "False color mapping",
  globals: {
    horizontal: {
        type: "boolean",
        default: false,
        uniform: "horizontal",
        ui: {
            label: "Horizontal",
            control: "checkbox"
        }
    },
    displacement: {
        type: "float",
        default: 0.5,
        uniform: "displacement",
        min: 0,
        max: 1,
        step: 0.01,
        ui: {
            label: "Displacement",
            control: "slider"
        }
    }
},
  passes: [
    {
      name: "main",
      program: "falseColor",
      inputs: {
        inputTex: "inputTex"
      },
      uniforms: {
        displacement: "displacement",
        horizontal: "horizontal",
        time: "time",
        speed: "speed"
      },
      outputs: {
        outputBuffer: "outputTex"
      }
    }
  ]
})
